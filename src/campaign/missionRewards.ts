import { CampaignRewardSchema, type CampaignReward } from '../schema/campaignRewards';
import type { Catalog } from '../schema/load';
import { LOCATIONS } from '../schema/common';
import type { BattleResult } from '../sim/world';
import { completedPlayerObjectives } from './missionProgression';
import { pristineCondition } from './repair';
import { recoveredHulk } from './salvagedHull';
import { addToStore, type CampaignRewardReceipt, type CampaignState, type Contract, type MechRecord } from './types';

interface EarnedReward { key: string; reward: CampaignReward }

export function earnedCampaignRewards(catalog: Catalog, state: CampaignState, contract: Contract,
  battle: BattleResult, participantCount: number): EarnedReward[] {
  if (participantCount === 0 || battle.missionStatus !== 'success' || battle.missionId !== contract.missionId
    || state.completedNodes.includes(contract.nodeId)) return [];
  const node = catalog.campaigns.get(state.campaignId)?.nodes.find((entry) => entry.id === contract.nodeId);
  const completed = new Set(completedPlayerObjectives(catalog, battle).map((objective) => objective.id));
  return (node?.rewards ?? []).map((reward) => ({ key: `${state.campaignId}/${contract.nodeId}/${reward.id}`, reward }))
    .filter(({ key, reward }) => !state.claimedRewardIds.includes(key)
      && (reward.objectiveId === undefined || completed.has(reward.objectiveId)));
}

/** Validate the entire grant before settlement changes injuries, XP, inventory or the campaign clock. */
export function validateRewardGrants(catalog: Catalog, grants: readonly EarnedReward[]): void {
  const seen = new Set<string>();
  for (const { key, reward } of grants) {
    if (seen.has(key)) throw new Error(`Duplicate contract reward: ${key}`);
    seen.add(key);
    const parsed = CampaignRewardSchema.safeParse(reward);
    if (!parsed.success) throw new Error(`Invalid contract reward: ${reward.id}`);
    for (const item of reward.items ?? []) {
      const source = item.kind === 'weapon' ? catalog.weapons : catalog.equipment;
      if (!source.has(item.itemId)) throw new Error(`Unknown ${item.kind} in contract reward: ${item.itemId}`);
    }
    for (const hull of reward.hulls ?? []) {
      const design = catalog.designs.get(hull.designId);
      if (design === undefined || !catalog.chassis.has(design.chassisId)) throw new Error(`Unknown hull in contract reward: ${hull.designId}`);
    }
  }
}

/** Warehouse awards are guaranteed contract goods; they never alter field recovery rolls or salvage picks. */
export function applyCampaignRewards(catalog: Catalog, state: CampaignState, grants: readonly EarnedReward[]): CampaignRewardReceipt[] {
  const pending = grants.filter((grant) => !state.claimedRewardIds.includes(grant.key));
  validateRewardGrants(catalog, pending);
  const receipts: CampaignRewardReceipt[] = [];
  for (const { key, reward } of pending) {
    const hulls: MechRecord[] = (reward.hulls ?? []).map((grant, index) => {
      const design = catalog.designs.get(grant.designId)!;
      const condition = pristineCondition(catalog, design);
      for (const location of LOCATIONS) {
        const part = condition[location];
        part.armour = Math.floor(part.armour * grant.integrityFraction);
        part.rearArmour = Math.floor(part.rearArmour * grant.integrityFraction);
        part.internal = Math.max(1, Math.floor(part.internal * grant.integrityFraction));
      }
      return recoveredHulk(catalog, { designId: grant.designId, condition }, `mech-${state.nextId + index}`, state.day)!;
    });
    const receipt: CampaignRewardReceipt = { id: key, label: reward.label, items: structuredClone(reward.items ?? []),
      hulls: hulls.map((hull) => ({ mechId: hull.id, designId: hull.design.id })), freeRepairDays: 0,
      supplierDiscountThroughDay: null, freeRepairDaysOffered: reward.effects?.freeRepairDays ?? 0, afterword: reward.afterword ?? '' };
    for (const item of receipt.items) addToStore(state, item.kind, item.itemId, item.count);
    state.mechs.push(...hulls);
    state.nextId += hulls.length;
    if (reward.effects?.freeRepairDays !== undefined) {
      receipt.freeRepairDays = Math.min(reward.effects.freeRepairDays,
        Math.max(0, catalog.rules.economy.campaignRewards.repairDayBankLimit - state.eventEffects.freeRepairDays));
      state.eventEffects.freeRepairDays += receipt.freeRepairDays;
    }
    if (reward.effects?.supplierDiscountDays !== undefined) {
      const through = state.day + reward.effects.supplierDiscountDays;
      state.eventEffects.supplierDiscountThroughDay = Math.max(state.eventEffects.supplierDiscountThroughDay ?? through, through);
      receipt.supplierDiscountThroughDay = state.eventEffects.supplierDiscountThroughDay;
    }
    state.claimedRewardIds.push(key);
    receipts.push(receipt);
  }
  return receipts;
}
