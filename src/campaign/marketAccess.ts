import type { Chassis } from '../schema/chassis';
import type { Faction } from '../schema/faction';
import type { Catalog } from '../schema/load';
import type { CampaignState } from './types';

/**
 * Story contracts finished so far. Side work is pruned out of the completed
 * list at every rollover, so only the authored war counts, which is the point:
 * the yard measures how established a company is, not how busy.
 */
export function contractsCompleted(catalog: Catalog, state: CampaignState): number {
  const campaign = catalog.campaigns.get(state.campaignId);
  if (campaign === undefined) return 0;
  const authored = new Set(campaign.nodes.map((node) => node.id));
  return state.completedNodes.filter((id) => authored.has(id)).length;
}

/** Whether the yard will show this class of machine to a company this far along. */
export function weightClassUnlocked(
  catalog: Catalog,
  state: CampaignState,
  weightClass: Chassis['class'],
): boolean {
  const needed = catalog.rules.economy.market.weightClassUnlocks[weightClass];
  return contractsCompleted(catalog, state) >= needed;
}

/**
 * The dearest crate the counter will put out, or null for no ceiling. The
 * last tier the company qualifies for applies; a company below every tier
 * is shown nothing, which the authored data avoids by starting a tier at zero.
 */
export function partPriceCeiling(catalog: Catalog, state: CampaignState): number | null {
  const completed = contractsCompleted(catalog, state);
  const reached = catalog.rules.economy.market.partPriceUnlocks
    .filter((tier) => tier.minCompleted <= completed)
    .sort((a, b) => a.minCompleted - b.minCompleted);
  const tier = reached[reached.length - 1];
  if (tier === undefined) return 0;
  return tier.maxPrice;
}

/**
 * What the counter charges for a maker's parts against the authored price,
 * or null when nobody this campaign knows sells them. The yard's own
 * suppliers sell at par; a campaign patron sells what the yard cannot, at a
 * markup that is the whole cost of being a Sealed company far from a depot.
 */
export function partSupplierFactor(
  catalog: Catalog,
  state: CampaignState,
  faction: Faction | undefined,
): number | null {
  if (faction === undefined) return null;
  if (catalog.rules.economy.market.availableFactions.includes(faction)) return 1;
  const supplier = catalog.campaigns
    .get(state.campaignId)
    ?.market.partSuppliers.find((entry) => entry.faction === faction);
  return supplier === undefined ? null : supplier.priceFactor;
}
