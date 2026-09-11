import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { LOCATIONS } from '../schema/common';
import type { Design } from '../schema/design';
import { advanceDays, startCampaign } from './campaign';
import { buyMech, marketListings, saleValueOf, sellMech } from './market';
import { rebuildHulk } from './refit';
import { estimateRepair, pristineCondition, startRepair } from './repair';
import { deserialiseCampaign, serialiseCampaign } from './save';
import { recoveredHulk } from './salvagedHull';
import type { MechRecord } from './types';

const designs = [...catalog.designs.values()].filter(
  (design) => catalog.chassis.get(design.chassisId)?.frame === 'mech',
);

function record(design: Design): MechRecord {
  return {
    id: `test-${design.id}`,
    design: structuredClone(design),
    condition: pristineCondition(catalog, design),
    status: 'ready',
    readyOnDay: 0,
    rebuildCost: 0,
  };
}

function halfArmour(mech: MechRecord): void {
  for (const condition of Object.values(mech.condition)) {
    condition.armour = Math.floor(condition.armour / 2);
    condition.rearArmour = Math.floor(condition.rearArmour / 2);
  }
}

function damagedCapture(design: Design): MechRecord {
  const mech = record(design);
  halfArmour(mech);
  for (const condition of Object.values(mech.condition)) {
    condition.internal = Math.ceil(condition.internal / 2);
  }
  mech.condition.left_arm = { armour: 0, rearArmour: 0, internal: 0, destroyed: true };
  const captured = recoveredHulk(catalog, {
    designId: design.id, condition: mech.condition,
  }, mech.id, 0);
  if (captured === null) throw new Error('missing captured design');
  return captured;
}

describe('campaign workshop affordability', () => {
  it('makes an intact capture a recommissioning expense, not another chassis purchase', () => {
    expect(designs.length).toBeGreaterThanOrEqual(16);
    for (const design of designs) {
      const baseCost = catalog.chassis.get(design.chassisId)?.baseCost ?? 0;
      const mech = recoveredHulk(catalog, {
        designId: design.id, condition: pristineCondition(catalog, design),
      }, `capture-${design.id}`, 0);
      if (mech === null) throw new Error('missing captured design');
      const quote = estimateRepair(catalog, mech);

      expect(quote.cost, design.name).toBeGreaterThan(0);
      expect(quote.cost, design.name).toBeLessThanOrEqual(baseCost * 0.2);
      expect(quote.days, design.name).toBeLessThanOrEqual(5);
      expect(mech.design.mounts, 'recommissioning does not invent replacement guns').toEqual([]);
    }
  });

  it('keeps a damaged capture affordable while charging more for a total wreck', () => {
    for (const design of designs) {
      const baseCost = catalog.chassis.get(design.chassisId)?.baseCost ?? 0;
      const captured = damagedCapture(design);
      const damaged = estimateRepair(catalog, captured);
      expect(damaged.cost, design.name).toBeLessThan(baseCost / 3);
      expect(damaged.days, design.name).toBeLessThanOrEqual(14);

      for (const location of LOCATIONS) {
        captured.condition[location] = { armour: 0, rearArmour: 0, internal: 0, destroyed: true };
      }
      const wreck = estimateRepair(catalog, captured);
      expect(wreck.cost, design.name).toBeGreaterThan(damaged.cost);
      expect(wreck.days, design.name).toBeGreaterThan(damaged.days);
    }
  });

  it.each(['border_dispute', 'aurelian_recall'])(
    'covers a routine half-armour fleet repair and sequential payroll from the first %s fee',
    (campaignId) => {
      const state = startCampaign(catalog, campaignId, 'routine-repair-budget');
      const firstFee = catalog.campaigns.get(campaignId)?.nodes[0]?.basePayout ?? 0;
      const openingCash = state.cbills;
      for (const mech of state.mechs) {
        halfArmour(mech);
        expect(startRepair(catalog, state, mech).ok).toBe(true);
      }
      const completionDay = Math.max(...state.mechs.map((mech) => mech.readyOnDay));
      advanceDays(catalog, state, completionDay - state.day, false);

      expect(state.mechs.every((mech) => mech.status === 'ready')).toBe(true);
      expect(openingCash - state.cbills).toBeLessThan(firstFee / 2);
      expect(state.cbills).toBeGreaterThan(0);
    },
  );

  it('keeps one major Aurelian loss significant but repairable from the opening reserve', () => {
    const state = startCampaign(catalog, 'aurelian_recall', 'major-repair-budget');
    const halberd = state.mechs.find((mech) => mech.design.id === 'halberd_prime');
    if (halberd === undefined) throw new Error('missing opening Halberd');
    const openingCash = state.cbills;
    for (const mech of state.mechs) halfArmour(mech);
    for (const location of ['left_torso', 'left_arm'] as const) {
      halberd.condition[location] = { armour: 0, rearArmour: 0, internal: 0, destroyed: true };
    }
    for (const mech of state.mechs) expect(startRepair(catalog, state, mech).ok).toBe(true);
    advanceDays(catalog, state, Math.max(...state.mechs.map((mech) => mech.readyOnDay)), false);

    const firstFee = catalog.campaigns.get('aurelian_recall')?.nodes[0]?.basePayout ?? 0;
    expect(openingCash - state.cbills).toBeGreaterThan(firstFee);
    expect(state.cbills).toBeGreaterThan(0);
    expect(state.mechs.every((mech) => mech.status === 'ready')).toBe(true);
  });

  it('finishes a small Aurelian plate patch in one day without double rounding', () => {
    const mech = startCampaign(catalog, 'aurelian_recall', 'small-patch').mechs[0];
    if (mech === undefined) throw new Error('missing Aurelian machine');
    mech.condition.centre_torso.armour -= 1;
    expect(estimateRepair(catalog, mech)).toMatchObject({ days: 1, cost: 338 });
  });
});

describe('unpaid legacy hulls and paid workshop promises', () => {
  it('quotes an old unbooked wreck at the current tariff without rewriting saved money or damage', () => {
    const state = startCampaign(catalog, 'aurelian_recall', 'legacy-unpaid-hull');
    const mech = state.mechs[0];
    if (mech === undefined) throw new Error('missing test machine');
    const baseCost = catalog.chassis.get(mech.design.chassisId)?.baseCost ?? 0;
    mech.status = 'hulk';
    mech.rebuildCost = Math.round(baseCost * 0.45);
    halfArmour(mech);
    const saved = serialiseCampaign(state);
    const restored = deserialiseCampaign(saved, catalog).state;
    if (restored === null || restored.mechs[0] === undefined) throw new Error('legacy save failed');
    const loaded = restored.mechs[0];
    const current = structuredClone(loaded);
    current.rebuildCost = Math.round(baseCost * catalog.rules.salvage.hulkRebuildCostFraction);

    expect(estimateRepair(catalog, loaded)).toEqual(estimateRepair(catalog, current));
    expect(serialiseCampaign(restored)).toBe(saved);
    const quote = estimateRepair(catalog, loaded);
    const cash = restored.cbills;
    expect(rebuildHulk(catalog, restored, loaded).ok).toBe(true);
    expect(restored.cbills).toBe(cash - quote.cost);
  });

  it('keeps already-paid long completion dates and any older discounted unpaid fee', () => {
    const state = startCampaign(catalog, 'border_dispute', 'legacy-paid-hull');
    const [paid, unpaid] = state.mechs;
    if (paid === undefined || unpaid === undefined) throw new Error('missing test fleet');
    state.day = 5;
    state.cbills = 500_000;
    paid.status = 'repairing';
    paid.readyOnDay = 70;
    unpaid.status = 'hulk';
    unpaid.rebuildCost = 1_000;
    const saved = serialiseCampaign(state);
    const restored = deserialiseCampaign(saved, catalog).state;
    if (restored === null) throw new Error('legacy save failed');
    expect(serialiseCampaign(restored)).toBe(saved);
    expect(estimateRepair(catalog, unpaid).cost).toBe(1_000);
    expect(rebuildHulk(catalog, state, unpaid).ok).toBe(true);
    expect(state.cbills).toBe(499_000);
    expect(paid.readyOnDay).toBe(70);
    expect(unpaid.readyOnDay).toBe(70 + catalog.rules.salvage.hulkRebuildDays);
  });
});

describe('salvage and yard anti-arbitrage', () => {
  it('never pays more to rebuild and sell a capture than to sell its inherited damage directly', () => {
    for (const design of designs) {
      const state = startCampaign(catalog, 'border_dispute', 'capture-no-flip');
      const mech = damagedCapture(design);
      state.mechs.push(mech);
      state.cbills = 100_000_000;
      const openingCash = state.cbills;
      const directSale = saleValueOf(catalog, mech);
      expect(rebuildHulk(catalog, state, mech).ok).toBe(true);
      advanceDays(catalog, state, mech.readyOnDay - state.day, false);
      expect(sellMech(catalog, state, mech.id).ok).toBe(true);
      expect(state.cbills - openingCash, design.name).toBeLessThanOrEqual(directSale);
    }
  });

  it('does not turn worn yard purchases into profitable repair-and-resale loops', () => {
    let wornCount = 0;
    for (let sample = 0; sample < 12; sample += 1) {
      const initial = startCampaign(catalog, 'border_dispute', `yard-no-flip-${sample}`);
      for (const listing of marketListings(catalog, initial)) {
        const state = structuredClone(initial);
        state.cbills = 100_000_000;
        const openingCash = state.cbills;
        expect(buyMech(catalog, state, listing.id).ok).toBe(true);
        const bought = state.mechs.at(-1);
        if (bought === undefined) throw new Error('purchase did not arrive');
        if (listing.worn) {
          wornCount += 1;
          expect(startRepair(catalog, state, bought).ok).toBe(true);
          advanceDays(catalog, state, bought.readyOnDay - state.day, false);
        }
        expect(sellMech(catalog, state, bought.id).ok).toBe(true);
        expect(state.cbills, listing.design.name).toBeLessThan(openingCash);
      }
    }
    expect(wornCount).toBeGreaterThan(0);
  });
});
