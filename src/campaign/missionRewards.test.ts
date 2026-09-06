import { describe, expect, it } from 'vitest';
import type { CampaignReward } from '../schema/campaignRewards';
import { resolveMission } from './campaign';
import { applyCampaignRewards, earnedCampaignRewards } from './missionRewards';
import { rewardBattle, rewardFixture } from './missionRewardFixtures';
import { deserialiseCampaign, serialiseCampaign } from './save';
import { rechooseSalvage } from './salvage';
import { addToStore } from './types';

const grant: CampaignReward = { id: 'warehouse', label: 'The sealed warehouse', objectiveId: 'cache',
  items: [{ kind: 'weapon', itemId: 'medium_laser', count: 2 }],
  hulls: [{ designId: 'hornet_spotter', integrityFraction: 0.5 }],
  effects: { freeRepairDays: 2, supplierDiscountDays: 5 }, afterword: 'The warehouse crew honour the company account.' };

describe('authored campaign rewards', () => {
  it('records guaranteed goods, a separate stripped warehouse hull and future benefits exactly once', () => {
    const { content, state, deployment } = rewardFixture([grant]);
    const battle = rewardBattle(deployment.missionId, deployment.lance);
    const awards = earnedCampaignRewards(content, state, state.contract!, battle, deployment.lance.length);
    const day = state.day;
    const beforeMechs = state.mechs.length;
    const run = resolveMission(content, state, battle, deployment.lance, false);
    expect(run.outcome.salvagedItems).toEqual([]);
    expect(run.outcome.salvagedChassis).toEqual([]);
    const receipt = run.outcome.campaignRewards![0]!;
    expect(receipt.items).toEqual(grant.items);
    expect(receipt.afterword).toBe(grant.afterword);
    expect(state.store).toContainEqual({ kind: 'weapon', itemId: 'medium_laser', count: 2 });
    expect(state.mechs).toHaveLength(beforeMechs + 1);
    const hull = state.mechs.find((mech) => mech.id === receipt.hulls[0]!.mechId)!;
    expect(hull.status).toBe('hulk');
    expect(hull.design.mounts).toEqual([]);
    expect(hull.design.ammo).toEqual([]);
    expect(hull.design.equipment).toEqual([]);
    expect(receipt.freeRepairDays).toBe(2);
    expect(state.eventEffects.freeRepairDays).toBe(2);
    expect(receipt.supplierDiscountThroughDay).toBe(day + 5);
    expect(state.day).toBe(day + 1);
    const restored = deserialiseCampaign(serialiseCampaign(state), content).state!;
    restored.history = [];
    const before = JSON.stringify(restored);
    expect(applyCampaignRewards(content, restored, awards)).toEqual([]);
    expect(JSON.stringify(restored)).toBe(before);
    expect(restored.claimedRewardIds).toEqual([receipt.id]);
  });

  it('requires success plus the stated objective and an actual deployed participant', () => {
    for (const scenario of ['failed', 'missed', 'forfeit'] as const) {
      const { content, state, deployment } = rewardFixture([grant]);
      const battle = rewardBattle(deployment.missionId, deployment.lance,
        scenario === 'failed' ? { missionStatus: 'failure' } : scenario === 'missed' ? { objectives: [] } : { units: [] });
      const run = resolveMission(content, state, battle, scenario === 'forfeit' ? [] : deployment.lance, false);
      expect(run.outcome.campaignRewards).toEqual([]);
      expect(state.claimedRewardIds).toEqual([]);
      expect(state.store).toEqual([]);
      expect(state.eventEffects.freeRepairDays).toBe(0);
    }
  });

  it.each(['item', 'hull', 'negative_count', 'duplicate'] as const)('rejects an invalid %s before any settlement mutation', (problem) => {
    const invalid = structuredClone(grant);
    if (problem === 'item') invalid.items!.push({ kind: 'equipment', itemId: 'missing_crate', count: 1 });
    if (problem === 'hull') invalid.hulls!.push({ designId: 'missing_hull', integrityFraction: 0.5 });
    if (problem === 'negative_count') invalid.items![0]!.count = -2;
    const { content, state, deployment } = rewardFixture(problem === 'duplicate' ? [invalid, invalid] : [invalid]);
    const before = JSON.stringify(state);
    expect(() => resolveMission(content, state, rewardBattle(deployment.missionId, deployment.lance), deployment.lance, false)).toThrow();
    expect(JSON.stringify(state)).toBe(before);
  });

  it('keeps guaranteed parts when salvage picks are changed', () => {
    const { content, state, deployment } = rewardFixture([grant]);
    const run = resolveMission(content, state, rewardBattle(deployment.missionId, deployment.lance), deployment.lance, false);
    addToStore(state, 'weapon', 'medium_laser', 1);
    const salvage = { ...run.salvage, offered: [{ kind: 'weapon' as const, itemId: 'medium_laser', count: 1 }],
      items: [{ kind: 'weapon' as const, itemId: 'medium_laser', count: 1 }], finalized: false };
    rechooseSalvage(state, salvage, []);
    expect(state.store.find((item) => item.itemId === 'medium_laser')?.count).toBe(2);
    expect(run.outcome.campaignRewards![0]!.items[0]!.count).toBe(2);
  });

  it('defaults old claim records safely and rejects damaged reward receipts', () => {
    const { content, state, deployment } = rewardFixture([grant]);
    resolveMission(content, state, rewardBattle(deployment.missionId, deployment.lance), deployment.lance, false);
    const old = JSON.parse(serialiseCampaign(state));
    delete old.state.claimedRewardIds;
    delete old.state.sharedXpClaims;
    delete old.state.history[0].campaignRewards;
    delete old.state.history[0].pilotReports[0].sharedXp;
    const restored = deserialiseCampaign(JSON.stringify(old), content).state!;
    expect(restored.claimedRewardIds).toEqual([]);
    expect(restored.sharedXpClaims).toEqual([]);
    expect(restored.history[0]!.campaignRewards ?? []).toEqual([]);
    const damaged = JSON.parse(serialiseCampaign(state));
    damaged.state.history[0].campaignRewards[0].items[0].count = -1;
    expect(deserialiseCampaign(JSON.stringify(damaged), content).state).toBeNull();
  });
});
