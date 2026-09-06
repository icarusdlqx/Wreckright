import type { Catalog } from '../../schema/load';
import type { CampaignState, CampaignRewardReceipt } from '../../campaign/types';
import type { CampaignReward } from '../../schema/campaignRewards';
import { authoredDesignName } from '../designLabel';
import './companyRewards.css';

function itemName(catalog: Catalog, item: { kind: string; itemId: string }): string {
  return (item.kind === 'weapon' ? catalog.weapons.get(item.itemId)?.name : catalog.equipment.get(item.itemId)?.name) ?? item.itemId;
}
function benefitText(catalog: Catalog, reward: CampaignReward): string[] {
  const benefits = (reward.items ?? []).map((item) => `${itemName(catalog, item)} ×${item.count}`);
  for (const hull of reward.hulls ?? []) {
    const design = catalog.designs.get(hull.designId);
    benefits.push(`${design === undefined ? hull.designId : authoredDesignName(catalog, design)} warehouse hull · stripped · ${Math.round(hull.integrityFraction * 100)}% condition`);
  }
  if (reward.effects?.freeRepairDays !== undefined) benefits.push(`${reward.effects.freeRepairDays} workshop day credit${reward.effects.freeRepairDays === 1 ? '' : 's'} · bank limit ${catalog.rules.economy.campaignRewards.repairDayBankLimit}`);
  if (reward.effects?.supplierDiscountDays !== undefined) {
    const supplier = catalog.rules.events.entries.find((entry) => entry.type === 'supplier_discount');
    const discount = supplier?.type === 'supplier_discount' ? Math.round((1 - supplier.priceFactor) * 100) : 0;
    benefits.push(`${discount}% off yard purchases for ${reward.effects.supplierDiscountDays} days after return`);
  }
  return benefits;
}

export function ContractRewards({ catalog, state, nodeId }: { catalog: Catalog; state: CampaignState; nodeId: string }) {
  const node = catalog.campaigns.get(state.campaignId)?.nodes.find((entry) => entry.id === nodeId);
  if ((node?.rewards?.length ?? 0) === 0) return null;
  return <section className="contract-rewards" data-testid="contract-rewards" aria-label="Guaranteed contract rewards">
    <h4>Contract rewards</h4><p>Guaranteed on the stated conditions, once per operation. These goods are separate from salvage rolls and your negotiated share.</p>
    <ul>{node?.rewards?.map((reward) => {
      const objective = catalog.missions.get(node.missionId)?.objectives.find((entry) => entry.id === reward.objectiveId);
      const claimed = state.claimedRewardIds.includes(`${state.campaignId}/${node.id}/${reward.id}`);
      return <li key={reward.id}><strong>{reward.label}</strong>
        <span>{claimed ? 'Already delivered' : reward.objectiveId === undefined ? 'Complete the contract successfully' : `Win the contract and complete: ${objective?.label ?? reward.objectiveId}`}</span>
        <small>{benefitText(catalog, reward).join(' · ')}</small>
      </li>;
    })}</ul>
  </section>;
}

export function RewardReceipt({ catalog, rewards }: { catalog: Catalog; rewards: readonly CampaignRewardReceipt[] }) {
  if (rewards.length === 0) return null;
  return <section className="contract-rewards reward-receipt" data-testid="debrief-contract-rewards" aria-label="Contract rewards delivered">
    <h4>Contract rewards delivered</h4><p>Already recorded in the company. These are separate from your salvage picks.</p>
    <ul>{rewards.map((reward) => <li key={reward.id} data-testid={`reward-receipt-${reward.id}`}><strong>{reward.label}</strong>
      {reward.afterword ? <p>{reward.afterword}</p> : null}
      {reward.items.length === 0 ? null : <span>To stores: {reward.items.map((item) => `${itemName(catalog, item)} ×${item.count}`).join(' · ')}</span>}
      {reward.hulls.length === 0 ? null : <span>To the workshop: {reward.hulls.map((hull) => {
        const design = catalog.designs.get(hull.designId); return design === undefined ? hull.designId : authoredDesignName(catalog, design);
      }).join(' · ')}. Warehouse hulls arrive stripped and require rebuilding.</span>}
      {(reward.freeRepairDaysOffered ?? reward.freeRepairDays) === 0 ? null : <span>{reward.freeRepairDays} workshop day credit{reward.freeRepairDays === 1 ? '' : 's'} banked for later bookings.{(reward.freeRepairDaysOffered ?? 0) > reward.freeRepairDays ? ' The remaining awarded credits exceeded the bank limit.' : ''}</span>}
      {reward.supplierDiscountThroughDay === null ? null : <span>Supplier purchase discount through day {reward.supplierDiscountThroughDay}.</span>}
    </li>)}</ul>
  </section>;
}
