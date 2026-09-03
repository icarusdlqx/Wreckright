import { beforeEach, describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import type { Catalog } from '../schema/load';
import { acceptContract, advanceDays, startCampaign } from './campaign';
import {
  buyMech,
  designMarketAvailable,
  designYardAvailable,
  marketListings,
  marketPeriod,
  saleValueOf,
  sellMech,
  storeItemMarketAvailable,
  storeItemSaleBasis,
  storeItemValueOf,
  valueOf,
} from './market';
import {
  completeRepair,
  estimateRepair,
  pristineCondition,
  startRepair,
  wreckedCondition,
} from './repair';
import { availableNodes } from './campaign';
import type { CampaignState } from './types';

let state: CampaignState;

beforeEach(() => {
  state = startCampaign(catalog, 'border_dispute', 'market');
});

/** Marks enough story contracts complete that every class of machine is on offer. */
function establishCompany(current: CampaignState): void {
  const unlocks = catalog.rules.economy.market.weightClassUnlocks;
  const needed = Math.max(unlocks.light, unlocks.medium, unlocks.heavy, unlocks.assault);
  const nodeIds = catalog.campaigns.get(current.campaignId)?.nodes.map((node) => node.id) ?? [];
  current.completedNodes.push(...nodeIds.slice(0, needed));
}

function classOf(designId: string) {
  const design = catalog.designs.get(designId);
  return design === undefined ? undefined : catalog.chassis.get(design.chassisId)?.class;
}

function firstListing(current: CampaignState) {
  const listing = marketListings(catalog, current)[0];
  if (listing === undefined) throw new Error('the lot was empty');
  return listing;
}

function supplierPriceFactor(): number {
  const event = catalog.rules.events.entries.find((entry) => entry.type === 'supplier_discount');
  if (event?.type !== 'supplier_discount') throw new Error('supplier event is missing');
  return event.priceFactor;
}

function fixedMachinePrices(): Catalog {
  return {
    ...catalog,
    rules: {
      ...catalog.rules,
      economy: {
        ...catalog.rules.economy,
        market: {
          ...catalog.rules.economy.market,
          priceVariance: [1, 1 + Number.EPSILON],
          wornChance: 0,
        },
      },
    },
  };
}

describe('the yard', () => {
  it('offers only hulls the yard can source, whatever is bolted to them', () => {
    expect(catalog.rules.economy.market.availableFactions).toEqual(['linewrought']);
    establishCompany(state);
    expect(marketListings(catalog, state)).not.toHaveLength(0);
    expect(marketListings(catalog, state).every((listing) =>
      designYardAvailable(catalog, listing.design),
    )).toBe(true);

    // The Bulwark carries Sealed lasers on a Linewrought hull: the parts are
    // not locally sourceable, the machine is, and the bay labels the mix.
    const bulwark = catalog.designs.get('bulwark_assault');
    if (bulwark === undefined) throw new Error('missing the Bulwark stock design');
    expect(designMarketAvailable(catalog, bulwark)).toBe(false);
    expect(designYardAvailable(catalog, bulwark)).toBe(true);
    const offered = new Set<string>();
    for (let week = 0; week < 12; week += 1) {
      for (const listing of marketListings(catalog, state)) offered.add(listing.design.id);
      state.day += catalog.rules.economy.market.refreshDays;
    }
    expect(offered).toContain('bulwark_assault');

    expect(
      storeItemMarketAvailable(catalog, { kind: 'weapon', itemId: 'gauss_rifle', count: 1 }),
    ).toBe(true);
    expect(
      storeItemMarketAvailable(catalog, { kind: 'equipment', itemId: 'case', count: 1 }),
    ).toBe(true);
    expect(
      storeItemMarketAvailable(catalog, { kind: 'weapon', itemId: 'medium_laser', count: 1 }),
    ).toBe(false);
    expect(
      storeItemMarketAvailable(catalog, { kind: 'equipment', itemId: 'active_probe', count: 1 }),
    ).toBe(false);
    expect(
      storeItemMarketAvailable(catalog, {
        kind: 'equipment',
        itemId: 'double_heat_sink',
        count: 1,
      }),
    ).toBe(false);
    expect(
      storeItemMarketAvailable(catalog, { kind: 'equipment', itemId: 'missing_part', count: 1 }),
    ).toBe(false);
  });

  it('prices a machine off the hull and everything bolted to it', () => {
    const design = catalog.designs.get('colossus_siege');
    const light = catalog.designs.get('wisp_scout');
    if (design === undefined || light === undefined) throw new Error('missing designs');

    expect(valueOf(catalog, design)).toBeGreaterThan(valueOf(catalog, light));

    const stripped = { ...design, mounts: [], equipment: [] };
    expect(valueOf(catalog, stripped)).toBeLessThan(valueOf(catalog, design));
    expect(valueOf(catalog, stripped)).toBe(catalog.chassis.get(design.chassisId)?.baseCost);
  });

  it('values a salvage crate on the same basis as a fitted part', () => {
    const crate = { kind: 'weapon' as const, itemId: 'medium_laser', count: 2 };
    const authored = catalog.weapons.get(crate.itemId)?.cost ?? 0;

    expect(storeItemValueOf(catalog, crate)).toBe(authored * crate.count);
    expect(storeItemSaleBasis(catalog, crate)).toBe(
      Math.round(authored * crate.count * catalog.rules.economy.market.sellFraction),
    );
  });

  it('does not assign value to an unknown crate from a damaged save', () => {
    const crate = { kind: 'equipment' as const, itemId: 'missing_part', count: 1 };
    expect(storeItemValueOf(catalog, crate)).toBe(0);
    expect(storeItemSaleBasis(catalog, crate)).toBe(0);
  });

  it('rebuilds the identical lot on every call', () => {
    // Same reason the hiring hall does: the campaign screen recomputes this on
    // every React render, and drawing from state.rng would tie the campaign's
    // random stream to how often the player looked at the shop.
    const before = state.rng;
    const first = marketListings(catalog, state);
    const second = marketListings(catalog, state);

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
    expect(state.rng).toEqual(before);
  });

  it('applies the supplier week before machine-price rounding without changing the lot', () => {
    const pricedCatalog = fixedMachinePrices();
    const regular = marketListings(pricedCatalog, state);
    state.eventEffects.supplierDiscountThroughDay = state.day;
    const discounted = marketListings(pricedCatalog, state);
    const rounding = pricedCatalog.rules.economy.market.priceRounding;
    const factor = supplierPriceFactor();

    expect(discounted).toHaveLength(regular.length);
    discounted.forEach((listing, index) => {
      const before = regular[index];
      if (before === undefined) throw new Error('discount changed the lot length');
      expect(listing.id).toBe(before.id);
      expect(listing.design).toBe(before.design);
      expect(listing.worn).toBe(before.worn);
      const raw = valueOf(pricedCatalog, listing.design) * factor;
      expect(listing.price).toBe(
        Math.max(rounding, Math.round(raw / rounding) * rounding),
      );
      expect(listing.price).toBeLessThanOrEqual(before.price);
    });
  });

  it('never applies a supplier purchase discount to yard sale proceeds', () => {
    const regular = startCampaign(catalog, 'border_dispute', 'sale-discount-invariance');
    const discounted = startCampaign(catalog, 'border_dispute', 'sale-discount-invariance');
    discounted.eventEffects.supplierDiscountThroughDay = discounted.day + 7;
    const regularMech = regular.mechs[0];
    const discountedMech = discounted.mechs[0];
    if (regularMech === undefined || discountedMech === undefined) {
      throw new Error('campaign has no saleable machine');
    }
    const regularBefore = regular.cbills;
    const discountedBefore = discounted.cbills;

    expect(sellMech(catalog, regular, regularMech.id).ok).toBe(true);
    expect(sellMech(catalog, discounted, discountedMech.id).ok).toBe(true);
    expect(regular.cbills - regularBefore).toBe(saleValueOf(catalog, regularMech));
    expect(discounted.cbills - discountedBefore).toBe(saleValueOf(catalog, discountedMech));
    expect(discounted.cbills - discountedBefore).toBe(regular.cbills - regularBefore);
  });

  it('holds the same stock all week and turns it over on the rollover', () => {
    const monday = marketListings(catalog, state);
    const period = marketPeriod(catalog, state.day);

    advanceDays(catalog, state, 1);
    expect(marketPeriod(catalog, state.day)).toBe(period);
    expect(marketListings(catalog, state).map(({ id, design, worn }) => ({
      id, designId: design.id, worn,
    }))).toEqual(monday.map(({ id, design, worn }) => ({ id, designId: design.id, worn })));

    advanceDays(catalog, state, catalog.rules.economy.market.refreshDays);
    expect(marketPeriod(catalog, state.day)).toBeGreaterThan(period);
    expect(marketListings(catalog, state).map((entry) => entry.id)).not.toEqual(
      monday.map((entry) => entry.id),
    );
  });

  it('keeps the heavier classes off the lot until the company has earned them', () => {
    const unlocks = catalog.rules.economy.market.weightClassUnlocks;
    expect(unlocks.light).toBe(0);
    expect(unlocks.heavy).toBeGreaterThan(0);
    expect(unlocks.assault).toBeGreaterThan(unlocks.heavy);
    const nodeIds = catalog.campaigns.get(state.campaignId)?.nodes.map((node) => node.id) ?? [];

    const classes = () => new Set(marketListings(catalog, state).map((l) => classOf(l.design.id)));
    // A first-week lot is still a full lot: the one light pattern, priced and
    // worn differently per slot, rather than three empty bays.
    expect(marketListings(catalog, state)).toHaveLength(catalog.rules.economy.market.listings);
    expect(classes()).toEqual(new Set(['light']));

    state.completedNodes.push(...nodeIds.slice(0, unlocks.heavy));
    expect(classes()).toEqual(new Set(['light', 'heavy']));

    state.completedNodes.push(...nodeIds.slice(unlocks.heavy, unlocks.assault));
    expect(classes()).toEqual(new Set(['light', 'heavy', 'assault']));

    // Side work is filler, not standing: a posting id never counts.
    const fresh = startCampaign(catalog, 'border_dispute', 'market-side');
    fresh.completedNodes.push('side_0_0', 'side_1_0', 'side_2_0');
    expect(new Set(marketListings(catalog, fresh).map((l) => classOf(l.design.id))))
      .toEqual(new Set(['light']));
  });

  it('spreads the lot across the weight classes', () => {
    establishCompany(state);
    const availableClasses = new Set(
      [...catalog.designs.values()]
        .filter((design) => designYardAvailable(catalog, design))
        .map((design) => catalog.chassis.get(design.chassisId)?.class),
    );

    // The yard has no Linewrought medium mech to sell. It still shows every
    // class it can source before a heavier class gets the spare fourth slot.
    for (let week = 0; week < 8; week += 1) {
      const classes = marketListings(catalog, state).map(
        (entry) => catalog.chassis.get(entry.design.chassisId)?.class,
      );
      expect(new Set(classes), `week ${week}`).toEqual(availableClasses);
      expect(classes, `week ${week}`).toContain('light');
      advanceDays(catalog, state, catalog.rules.economy.market.refreshDays);
    }
  });

  it('takes a bought machine off the lot, and leaves its neighbours priced as they were', () => {
    const stock = marketListings(catalog, state);
    const bought = stock[0];
    const other = stock[1];
    if (bought === undefined || other === undefined) throw new Error('the lot was too thin');

    state.cbills = 100_000_000;
    expect(buyMech(catalog, state, bought.id).ok).toBe(true);

    const after = marketListings(catalog, state);
    expect(after.map((entry) => entry.id)).not.toContain(bought.id);
    // Every slot draws whether or not it survives the filter, so consuming one
    // cannot move the price of the one beside it.
    expect(after.find((entry) => entry.id === other.id)).toEqual(other);
  });

  it('forgets last week’s purchases rather than remembering them forever', () => {
    state.cbills = 100_000_000;
    expect(buyMech(catalog, state, firstListing(state).id).ok).toBe(true);
    expect(state.marketBought).toHaveLength(1);

    advanceDays(catalog, state, catalog.rules.economy.market.refreshDays * 2);
    expect(state.marketBought).toHaveLength(0);
  });

  it('puts a bought machine in the bay and takes the money for it', () => {
    const listing = firstListing(state);
    state.cbills = listing.price + 5_000;
    const bays = state.mechs.length;

    expect(buyMech(catalog, state, listing.id).ok).toBe(true);
    expect(state.cbills).toBe(5_000);
    expect(state.mechs).toHaveLength(bays + 1);

    const bought = state.mechs[state.mechs.length - 1];
    if (bought === undefined) throw new Error('nothing arrived');
    expect(bought.design.id).toBe(listing.design.id);
    expect(bought.status).toBe('ready');
    expect(bought.rebuildCost).toBe(0);
    // A copy, not the catalog entry: refitting it must not edit the design the
    // rest of the campaign reads.
    expect(bought.design).not.toBe(listing.design);
  });

  it('sells a worn machine short of plate, not broken', () => {
    // Cheaper for a reason, and the reason is the workshop bill afterwards.
    state.cbills = 100_000_000;
    const worn = marketListings(catalog, state).find((entry) => entry.worn);
    if (worn === undefined) return;

    expect(buyMech(catalog, state, worn.id).ok).toBe(true);
    const bought = state.mechs[state.mechs.length - 1];
    if (bought === undefined) throw new Error('nothing arrived');

    const locations = Object.values(bought.condition);
    expect(locations.every((entry) => !entry.destroyed)).toBe(true);
    expect(locations.every((entry) => entry.internal > 0)).toBe(true);
    expect(locations.some((entry) => entry.armour > 0)).toBe(true);
  });

  it('will not sell a machine the company cannot pay for', () => {
    const listing = firstListing(state);
    state.cbills = listing.price - 1;
    const bays = state.mechs.length;

    const result = buyMech(catalog, state, listing.id);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/credits/);
    expect(state.mechs).toHaveLength(bays);
    expect(state.cbills).toBe(listing.price - 1);
  });

  it('will not sell something that is not on the lot', () => {
    expect(buyMech(catalog, state, 'market_99_9').ok).toBe(false);
  });

  it('deducts the workshop bill from a damaged machine', () => {
    const mech = state.mechs[0];
    if (mech === undefined) throw new Error('the bay was empty');

    const full = valueOf(catalog, mech.design);
    const pristineSale = Math.round(full * catalog.rules.economy.market.sellFraction);
    expect(saleValueOf(catalog, mech)).toBe(pristineSale);

    mech.condition.left_arm.armour = Math.max(0, mech.condition.left_arm.armour - 18);
    mech.condition.left_arm.internal = Math.max(1, mech.condition.left_arm.internal - 4);
    const repair = estimateRepair(catalog, mech);

    expect(repair.cost).toBeGreaterThan(0);
    expect(saleValueOf(catalog, mech)).toBe(Math.max(0, pristineSale - repair.cost));

    completeRepair(catalog, mech);
    expect(saleValueOf(catalog, mech)).toBe(pristineSale);
  });

  it('does not let a worn purchase resell as a pristine machine', () => {
    const design = state.mechs[0]?.design;
    if (design === undefined) throw new Error('the bay was empty');
    const mech = state.mechs[0];
    if (mech === undefined) throw new Error('the bay was empty');

    const pristineSale = saleValueOf(catalog, mech);
    const worn = pristineCondition(catalog, design);
    for (const condition of Object.values(worn)) {
      condition.armour = Math.floor(condition.armour * 0.45);
      condition.rearArmour = Math.floor(condition.rearArmour * 0.45);
    }
    mech.condition = worn;

    expect(saleValueOf(catalog, mech)).toBeLessThan(pristineSale);
  });

  it('makes the yard inherit a hulk\'s full rebuild and field-damage quote', () => {
    const mech = state.mechs[0];
    if (mech === undefined) throw new Error('the bay was empty');
    const fullSale = Math.round(
      valueOf(catalog, mech.design) * catalog.rules.economy.market.sellFraction,
    );

    mech.status = 'hulk';
    mech.condition = wreckedCondition(catalog, mech.design);
    mech.rebuildCost = Math.floor(fullSale / 3);

    const inherited = estimateRepair(catalog, mech);
    expect(inherited.cost).toBeGreaterThan(mech.rebuildCost);
    expect(saleValueOf(catalog, mech)).toBe(Math.max(0, fullSale - inherited.cost));
  });

  it('does not charge a repair bill twice after work has started', () => {
    const mech = state.mechs[0];
    if (mech === undefined) throw new Error('the bay was empty');
    const fullSale = saleValueOf(catalog, mech);
    mech.condition.left_arm.armour = 0;
    state.cbills = 10_000_000;

    const repair = startRepair(catalog, state, mech);
    expect(repair.ok).toBe(true);
    expect(repair.estimate.cost).toBeGreaterThan(0);
    expect(mech.status).toBe('repairing');
    expect(saleValueOf(catalog, mech)).toBe(fullSale);
  });

  it('unseats whoever was sitting in a machine it sells', () => {
    const mech = state.mechs[0];
    if (mech === undefined) throw new Error('the bay was empty');
    const seated = state.pilots.filter((pilot) => pilot.mechId === mech.id);
    expect(seated.length).toBeGreaterThan(0);

    const before = state.cbills;
    const worth = saleValueOf(catalog, mech);
    expect(sellMech(catalog, state, mech.id).ok).toBe(true);

    expect(state.cbills).toBe(before + worth);
    expect(state.mechs.some((entry) => entry.id === mech.id)).toBe(false);
    expect(seated.every((pilot) => pilot.mechId === null)).toBe(true);
  });

  it('refuses the last machine in the bay', () => {
    const kept = state.mechs[0];
    if (kept === undefined) throw new Error('the bay was empty');
    state.mechs = [kept];

    const result = sellMech(catalog, state, kept.id);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/last machine/);
    expect(state.mechs).toHaveLength(1);
  });

  it('refuses to sell under contract', () => {
    const node = availableNodes(catalog, state)[0];
    const mech = state.mechs[0];
    if (node === undefined || mech === undefined) throw new Error('nothing to sign or sell');

    expect(acceptContract(catalog, state, node.id, 'fee_first').ok).toBe(true);
    const result = sellMech(catalog, state, mech.id);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/contract/);
  });
});
