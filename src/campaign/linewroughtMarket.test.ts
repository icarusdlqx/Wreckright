import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { computeLoadout } from '../sim/loadout';
import { startCampaign } from './campaign';
import { buyMech, designMarketAvailable, marketListings, valueOf } from './market';

const NEW_STOCK = [
  ['prybar_courier', 1_820_000],
  ['rivet_escort', 3_935_000],
  ['trestle_battery', 4_825_000],
] as const;

describe('new Linewrought stock in the existing yard', () => {
  it.each(NEW_STOCK)('%s uses the normal local supply and valuation rules', (id, expectedValue) => {
    const design = catalog.designs.get(id);
    if (design === undefined) throw new Error(`missing stock design ${id}`);
    expect(designMarketAvailable(catalog, design)).toBe(true);
    expect(valueOf(catalog, design)).toBe(expectedValue);
  });

  it.each(NEW_STOCK)('%s rotates onto the lot and can be purchased once for the posted price', (id) => {
    const state = startCampaign(catalog, 'border_dispute', 'ironwork-market');
    let listing = marketListings(catalog, state).find((entry) => entry.design.id === id);
    for (let week = 1; listing === undefined && week < 32; week += 1) {
      state.day = week * catalog.rules.economy.market.refreshDays;
      listing = marketListings(catalog, state).find((entry) => entry.design.id === id);
    }
    expect(listing, id).toBeDefined();
    if (listing === undefined) throw new Error(`${id} never reached the rotating yard`);
    const quoted = marketListings(catalog, state);
    const count = state.mechs.length;
    state.cbills = listing.price + 10_000;

    expect(buyMech(catalog, state, listing.id).ok).toBe(true);
    expect(state.cbills).toBe(10_000);
    expect(state.mechs).toHaveLength(count + 1);
    const delivered = state.mechs[state.mechs.length - 1];
    if (delivered === undefined) throw new Error('purchased machine was not delivered');
    expect(delivered.design.id).toBe(id);
    expect(delivered.design).not.toBe(listing.design);
    expect(computeLoadout(catalog, delivered.design).valid).toBe(true);
    expect(marketListings(catalog, state)).toEqual(quoted.filter((entry) => entry.id !== listing.id));
    expect(buyMech(catalog, state, listing.id).ok).toBe(false);
    expect(state.cbills).toBe(10_000);
    expect(state.mechs).toHaveLength(count + 1);
  });
});
