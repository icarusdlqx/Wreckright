import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import type { Catalog } from '../schema/load';
import { buyPart, marketListings, partMarketListings, pruneMarket } from './market';
import { partPriceCeiling, partSupplierFactor } from './marketAccess';
import { startCampaign } from './campaign';

function freshState() {
  return startCampaign(catalog, 'border_dispute', 'parts-test');
}

function fixedPartPrices(): Catalog {
  return {
    ...catalog,
    rules: {
      ...catalog.rules,
      economy: {
        ...catalog.rules.economy,
        market: {
          ...catalog.rules.economy.market,
          priceVariance: [1, 1 + Number.EPSILON],
        },
      },
    },
  };
}

function supplierPriceFactor(): number {
  const event = catalog.rules.events.entries.find((entry) => entry.type === 'supplier_discount');
  if (event?.type !== 'supplier_discount') throw new Error('supplier event is missing');
  return event.priceFactor;
}

describe('the parts counter', () => {
  it('stocks the authored number of crates, all from suppliers the yard can reach', () => {
    const state = freshState();
    const listings = partMarketListings(catalog, state);

    expect(listings).toHaveLength(catalog.rules.economy.market.partListings);
    for (const listing of listings) {
      const faction =
        listing.kind === 'weapon'
          ? catalog.weapons.get(listing.itemId)?.faction
          : catalog.equipment.get(listing.itemId)?.faction;
      expect(catalog.rules.economy.market.availableFactions, listing.itemId).toContain(faction);
      expect(listing.price).toBeGreaterThan(0);
      expect(listing.price % catalog.rules.economy.market.partPriceRounding).toBe(0);
    }
  });

  it('keeps the dear crates back until the company has standing', () => {
    const state = freshState();
    const tiers = catalog.rules.economy.market.partPriceUnlocks;
    const opening = partPriceCeiling(catalog, state);
    expect(opening).not.toBeNull();
    if (opening === null) return;
    const authoredCost = (listing: { kind: string; itemId: string }) =>
      listing.kind === 'weapon'
        ? catalog.weapons.get(listing.itemId)?.cost ?? 0
        : catalog.equipment.get(listing.itemId)?.cost ?? 0;
    for (let week = 0; week < 8; week += 1) {
      for (const listing of partMarketListings(catalog, state)) {
        expect(authoredCost(listing), listing.itemId).toBeLessThanOrEqual(opening);
      }
      state.day += catalog.rules.economy.market.refreshDays;
    }

    const last = tiers[tiers.length - 1];
    if (last === undefined) throw new Error('no part price tiers');
    const nodeIds = catalog.campaigns.get(state.campaignId)?.nodes.map((node) => node.id) ?? [];
    state.completedNodes.push(...nodeIds.slice(0, last.minCompleted));
    expect(partPriceCeiling(catalog, state)).toBe(last.maxPrice);
    const dearest = Math.max(
      ...[...catalog.weapons.values()]
        .filter((weapon) => weapon.faction === 'linewrought')
        .map((weapon) => weapon.cost),
    );
    expect(dearest).toBeGreaterThan(opening);
    let seenDearest = false;
    for (let week = 0; week < 24 && !seenDearest; week += 1) {
      seenDearest = partMarketListings(catalog, state).some(
        (listing) => authoredCost(listing) === dearest,
      );
      state.day += catalog.rules.economy.market.refreshDays;
    }
    expect(seenDearest).toBe(true);
  });

  it('sells the Custodians Sealed spares at their patron\'s markup, and nobody else', () => {
    const border = freshState();
    expect(partSupplierFactor(catalog, border, 'aurelian')).toBeNull();
    expect(partSupplierFactor(catalog, border, 'linewrought')).toBe(1);

    const recall = startCampaign(catalog, 'aurelian_recall', 'parts-recall');
    const markup = partSupplierFactor(catalog, recall, 'aurelian');
    expect(markup).toBe(2);
    if (markup === null) return;
    const nodeIds = catalog.campaigns.get(recall.campaignId)?.nodes.map((node) => node.id) ?? [];
    recall.completedNodes.push(...nodeIds.slice(0, 4));
    expect(partPriceCeiling(catalog, recall)).toBeNull();

    const priced = fixedPartPrices();
    const rounding = priced.rules.economy.market.partPriceRounding;
    let sealed = 0;
    for (let week = 0; week < 12; week += 1) {
      for (const listing of partMarketListings(priced, recall)) {
        const weapon = catalog.weapons.get(listing.itemId);
        if (listing.kind !== 'weapon' || weapon?.faction !== 'aurelian') continue;
        sealed += 1;
        const raw = weapon.cost * markup;
        expect(listing.price).toBe(Math.round(raw / rounding) * rounding);
      }
      // The yard itself stays Linewrought: a patron sells spares, not machines.
      for (const listing of marketListings(catalog, recall)) {
        expect(catalog.chassis.get(listing.design.chassisId)?.faction).toBe('linewrought');
      }
      recall.day += catalog.rules.economy.market.refreshDays;
    }
    expect(sealed).toBeGreaterThan(0);
  });

  it('offers the same crates at the same prices however often the player looks', () => {
    const state = freshState();
    expect(partMarketListings(catalog, state)).toEqual(partMarketListings(catalog, state));
  });

  it('discounts crates before rounding without changing their identity', () => {
    const pricedCatalog = fixedPartPrices();
    const state = freshState();
    const regular = partMarketListings(pricedCatalog, state);
    state.eventEffects.supplierDiscountThroughDay = state.day;
    const discounted = partMarketListings(pricedCatalog, state);
    const rounding = pricedCatalog.rules.economy.market.partPriceRounding;
    const factor = supplierPriceFactor();

    expect(discounted).toHaveLength(regular.length);
    discounted.forEach((listing, index) => {
      const before = regular[index];
      if (before === undefined) throw new Error('discount changed the crate count');
      expect({ ...listing, price: 0 }).toEqual({ ...before, price: 0 });
      const authored = listing.kind === 'weapon'
        ? pricedCatalog.weapons.get(listing.itemId)?.cost
        : pricedCatalog.equipment.get(listing.itemId)?.cost;
      const raw = (authored ?? 0) * factor;
      expect(listing.price).toBe(
        Math.max(rounding, Math.round(raw / rounding) * rounding),
      );
      expect(listing.price).toBeLessThanOrEqual(before.price);
    });
  });

  it('charges the discounted crate price at the counter', () => {
    const state = freshState();
    state.eventEffects.supplierDiscountThroughDay = state.day + 7;
    const listing = partMarketListings(catalog, state)[0];
    if (listing === undefined) throw new Error('the parts counter is empty');
    state.cbills = listing.price;

    expect(buyPart(catalog, state, listing.id).ok).toBe(true);
    expect(state.cbills).toBe(0);
  });

  it('sells a crate into stores and takes the money', () => {
    const state = freshState();
    const listing = partMarketListings(catalog, state)[0];
    expect(listing).toBeDefined();
    if (listing === undefined) return;

    const before = state.cbills;
    const result = buyPart(catalog, state, listing.id);

    expect(result.ok).toBe(true);
    expect(state.cbills).toBe(before - listing.price);
    expect(
      state.store.find((item) => item.kind === listing.kind && item.itemId === listing.itemId)?.count,
    ).toBeGreaterThanOrEqual(1);
    // The crate leaves the counter; the rest keep their prices.
    const remaining = partMarketListings(catalog, state);
    expect(remaining.find((entry) => entry.id === listing.id)).toBeUndefined();
    expect(remaining).toHaveLength(catalog.rules.economy.market.partListings - 1);
  });

  it('refuses a crate the company cannot pay for', () => {
    const state = freshState();
    state.cbills = 0;
    const listing = partMarketListings(catalog, state)[0];
    if (listing === undefined) return;

    const result = buyPart(catalog, state, listing.id);
    expect(result.ok).toBe(false);
    expect(state.store).toHaveLength(0);
  });

  it('restocks and forgets old purchases when the week rolls over', () => {
    const state = freshState();
    const listing = partMarketListings(catalog, state)[0];
    if (listing === undefined) return;
    buyPart(catalog, state, listing.id);

    state.day += catalog.rules.economy.market.refreshDays;
    pruneMarket(catalog, state);

    expect(state.marketBought).toHaveLength(0);
    expect(partMarketListings(catalog, state)).toHaveLength(
      catalog.rules.economy.market.partListings,
    );
  });
});
