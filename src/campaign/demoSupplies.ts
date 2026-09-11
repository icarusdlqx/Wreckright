import type { Catalog } from '../schema/load';
import { addToStore, type CampaignState } from './types';
import { logCampaign } from './campaignState';

export function demoSupplyKey(catalog: Catalog, state: CampaignState): string | null {
  const crate = catalog.campaigns.get(state.campaignId)?.demoSupplies;
  return crate === undefined ? null : `${state.campaignId}/demo-supplies/${crate.id}`;
}

export function hasDemoSupplies(catalog: Catalog, state: CampaignState): boolean {
  const key = demoSupplyKey(catalog, state);
  return key !== null && state.claimedRewardIds.includes(key);
}

/** A one-off grant also lets an existing demo save collect the same starting stock. */
export function claimDemoSupplies(catalog: Catalog, state: CampaignState): boolean {
  const crate = catalog.campaigns.get(state.campaignId)?.demoSupplies;
  const key = demoSupplyKey(catalog, state);
  if (state.finished || crate === undefined || key === null || state.claimedRewardIds.includes(key)) return false;
  for (const item of crate.items) {
    const source = item.kind === 'weapon' ? catalog.weapons : catalog.equipment;
    if (!source.has(item.itemId) || !Number.isInteger(item.count) || item.count < 1) throw new Error('Invalid demo supply crate');
  }
  for (const item of crate.items) addToStore(state, item.kind, item.itemId, item.count);
  state.claimedRewardIds.push(key);
  logCampaign(state, `${crate.label} received. Advanced equipment follows through contract rewards and salvage.`);
  return true;
}
