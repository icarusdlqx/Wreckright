import { describe, expect, it } from 'vitest';
import { LOCATIONS } from '../schema/common';
import { catalog } from '../../tests/support';
import { advanceDays, startCampaign } from './campaign';
import { deployableLance } from './deployment';
import { fitFromStore, rebuildHulk } from './refit';
import { estimateRepair } from './repair';
import { assign } from './roster';
import { deserialiseCampaign, serialiseCampaign } from './save';
import { recoveredHulk } from './salvagedHull';
import { addToStore, type RecoveredHull } from './types';

function fieldHull(): RecoveredHull {
  return {
    designId: 'sentinel_brawler',
    condition: Object.fromEntries(
      LOCATIONS.map((location, index) => [
        location,
        { armour: index + 1, rearArmour: 0, internal: index + 2, destroyed: location === 'head' },
      ]),
    ) as RecoveredHull['condition'],
  };
}

describe('recovered campaign hull', () => {
  it('keeps its field damage and arrives without duplicated loose parts', () => {
    const source = fieldHull();
    const mech = recoveredHulk(catalog, source, 'mech-salvage', 7);
    if (mech === null) throw new Error('the salvage design is missing');

    expect(mech).toMatchObject({ id: 'mech-salvage', status: 'hulk', readyOnDay: 7 });
    expect(mech.condition).toEqual(source.condition);
    expect(mech.condition).not.toBe(source.condition);
    expect(mech.design.armour).toEqual(catalog.designs.get(source.designId)?.armour);
    expect(mech.design.heatSinks).toBe(
      catalog.chassis.get(mech.design.chassisId)?.internalHeatSinks,
    );
    expect(mech.design.mounts).toEqual([]);
    expect(mech.design.ammo).toEqual([]);
    expect(mech.design.equipment).toEqual([]);
    expect(mech.rebuildCost).toBeGreaterThan(0);
  });

  it('holds a wreck\'s whole quote under the chassis price new', () => {
    const mech = recoveredHulk(catalog, fieldHull(), 'mech-cap', 0);
    if (mech === null) throw new Error('the salvage design is missing');
    for (const location of LOCATIONS) {
      mech.condition[location] = { armour: 0, rearArmour: 0, internal: 1, destroyed: true };
    }
    const chassis = catalog.chassis.get(mech.design.chassisId);
    if (chassis === undefined) throw new Error('the salvage chassis is missing');
    const cap = Math.round(chassis.baseCost * catalog.rules.salvage.hulkRebuildCostCap);
    const uncapped = {
      ...catalog,
      rules: {
        ...catalog.rules,
        salvage: { ...catalog.rules.salvage, hulkRebuildCostCap: Number.POSITIVE_INFINITY },
      },
    };

    const quote = estimateRepair(catalog, mech);
    expect(estimateRepair(uncapped, mech).cost).toBeGreaterThan(cap);
    expect(quote.cost).toBe(cap);
    // The cap is a price, not a shortcut: the calendar still runs its course.
    expect(quote.days).toBe(estimateRepair(uncapped, mech).days);
  });

  it('rebuilds a cored light for well under half its price new', () => {
    const cored: RecoveredHull = {
      designId: 'hornet_spotter',
      condition: Object.fromEntries(
        LOCATIONS.map((location) => [
          location,
          { armour: 0, rearArmour: 0, internal: 1, destroyed: location === 'centre_torso' },
        ]),
      ) as RecoveredHull['condition'],
    };
    const mech = recoveredHulk(catalog, cored, 'mech-cored', 0);
    if (mech === null) throw new Error('the salvage design is missing');
    const chassis = catalog.chassis.get(mech.design.chassisId);
    if (chassis === undefined) throw new Error('the salvage chassis is missing');

    const quote = estimateRepair(catalog, mech);
    expect(quote.cost).toBeLessThan(chassis.baseCost * 0.5);
    // A cored light used to sit in the bay for most of six weeks.
    expect(quote.days).toBeLessThan(30);
  });

  it('does not invent a hull for an unknown recovered design', () => {
    expect(recoveredHulk(catalog, { ...fieldHull(), designId: 'missing' }, 'mech-x', 0)).toBeNull();
  });

  it('round-trips a stripped wreck through the existing campaign save', () => {
    const state = startCampaign(catalog, 'border_dispute', 'salvaged-hull-save');
    const mech = recoveredHulk(catalog, fieldHull(), 'mech-salvage', state.day);
    if (mech === null) throw new Error('the salvage design is missing');
    state.mechs.push(mech);

    const restored = deserialiseCampaign(serialiseCampaign(state), catalog).state;
    const saved = restored?.mechs.find((entry) => entry.id === mech.id);
    expect(saved?.condition).toEqual(mech.condition);
    expect(saved?.design.mounts).toEqual([]);
    expect(saved?.design.ammo).toEqual([]);
    expect(saved?.design.equipment).toEqual([]);
  });

  it('keeps an unarmed rebuild in the bay until a real weapon is fitted', () => {
    const state = startCampaign(catalog, 'border_dispute', 'salvaged-hull-rebuild');
    const mech = recoveredHulk(catalog, fieldHull(), 'mech-salvage', state.day);
    if (mech === null) throw new Error('the salvage design is missing');
    state.mechs.push(mech);

    const pilot = state.pilots[0];
    if (pilot === undefined) throw new Error('the campaign has no pilot');
    assign(state, pilot.id, mech.id);
    const quote = estimateRepair(catalog, mech);
    expect(quote.cost).toBeGreaterThan(mech.rebuildCost);
    expect(quote.days).toBeGreaterThan(catalog.rules.salvage.hulkRebuildDays);
    state.cbills = Math.max(state.cbills, quote.cost);

    expect(rebuildHulk(catalog, state, mech).ok).toBe(true);
    expect(state.cbills).toBeGreaterThanOrEqual(0);
    advanceDays(catalog, state, quote.days);
    expect(mech).toMatchObject({ status: 'ready', rebuildCost: 0 });
    expect(mech.design.mounts).toEqual([]);
    expect(deployableLance(state).some((pair) => pair.mech.id === mech.id)).toBe(false);
    expect(deserialiseCampaign(serialiseCampaign(state), catalog).state).not.toBeNull();

    addToStore(state, 'weapon', 'medium_laser');
    expect(fitFromStore(catalog, state, mech, 'medium_laser').ok).toBe(true);
    expect(deployableLance(state).some((pair) => pair.mech.id === mech.id)).toBe(true);
    expect(deserialiseCampaign(serialiseCampaign(state), catalog).state).not.toBeNull();
  });
});
