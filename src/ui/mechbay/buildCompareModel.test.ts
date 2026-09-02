import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { computeLoadout } from '../../sim/loadout';
import {
  buildMetrics,
  compareBuilds,
  compareBuildToStock,
  designAlphaDamage,
  designDpsForBand,
  displayedDirection,
  stockDesignFor,
} from './buildCompareModel';

function stock(id: string): Design {
  const design = catalog.designs.get(id);
  if (design === undefined) throw new Error(`missing stock design ${id}`);
  return structuredClone(design);
}

function colossusLongshotTrade(): { baseline: Design; current: Design } {
  const baseline = stock('colossus_siege');
  const current = structuredClone(baseline);
  current.id = 'colossus_longshot_trade';
  current.name = "Colossus 'Long Reach'";

  const gauss = current.mounts.findIndex(
    (mount) => mount.weaponId === 'gauss_rifle' && mount.location === 'right_torso',
  );
  if (gauss < 0) throw new Error('missing right-torso Gauss fixture');
  current.mounts.splice(
    gauss,
    1,
    { weaponId: 'lrm10', location: 'right_torso' },
    { weaponId: 'lrm10', location: 'left_torso' },
  );

  const rightGaussAmmo = current.ammo.find(
    (load) => load.weaponId === 'gauss_rifle' && load.location === 'right_torso',
  );
  const leftLongshotAmmo = current.ammo.find(
    (load) => load.weaponId === 'lrm10' && load.location === 'left_torso',
  );
  if (rightGaussAmmo === undefined || leftLongshotAmmo === undefined) {
    throw new Error('missing Colossus ammunition fixture');
  }
  rightGaussAmmo.tons = 1;
  leftLongshotAmmo.tons = 4;
  return { baseline, current };
}

function metricMap(comparison: ReturnType<typeof compareBuilds>) {
  return new Map(comparison.metrics.map((entry) => [entry.id, entry]));
}

describe('build comparison metrics', () => {
  it('compares the legal Colossus Gauss-to-two-Longshots trade exactly', () => {
    const { baseline, current } = colossusLongshotTrade();
    const baselineLoadout = computeLoadout(catalog, baseline);
    const currentLoadout = computeLoadout(catalog, current);
    const comparison = compareBuilds(catalog, baseline, current);
    const metrics = metricMap(comparison);

    expect(baselineLoadout).toMatchObject({ valid: true, usedWeight: 100, freeTonnage: 0 });
    expect(currentLoadout).toMatchObject({ valid: true, usedWeight: 95, freeTonnage: 5 });
    expect(comparison.before.speed).toBeCloseTo(9, 8);
    expect(comparison.after.speed).toBeCloseTo(9, 8);
    expect(comparison.before.armour).toBe(700);
    expect(comparison.after.armour).toBe(700);
    expect(comparison.before.heatMargin).toBeCloseTo(0.8, 8);
    expect(comparison.after.heatMargin).toBeCloseTo(-0.95, 8);
    expect(comparison.before.alphaDamage).toBeCloseTo(70.5, 8);
    expect(comparison.after.alphaDamage).toBeCloseTo(94.5, 8);
    expect(comparison.before.dps.short).toBeCloseTo(20.125, 8);
    expect(comparison.after.dps.short).toBeCloseTo(26.125, 8);
    expect(comparison.before.dps.medium).toBeCloseTo(16.5025, 8);
    expect(comparison.after.dps.medium).toBeCloseTo(21.4225, 8);
    expect(comparison.before.dps.long).toBeCloseTo(11.6725, 8);
    expect(comparison.after.dps.long).toBeCloseTo(15.1525, 8);

    expect(metrics.get('speed')).toMatchObject({
      beforeText: '9.0',
      afterText: '9.0',
      direction: 'neutral',
    });
    expect(metrics.get('armour')).toMatchObject({
      beforeText: '700',
      afterText: '700',
      direction: 'neutral',
    });
    expect(metrics.get('heat_margin')).toMatchObject({
      beforeText: '+0.8',
      afterText: '-1.0',
      direction: 'bad',
    });
    expect(metrics.get('alpha_damage')).toMatchObject({
      beforeText: '70.5',
      afterText: '94.5',
      direction: 'good',
    });
    expect(metrics.get('dps_short')).toMatchObject({
      label: 'Short-band DPS',
      beforeText: '20.1',
      afterText: '26.1',
      direction: 'good',
    });
    expect(metrics.get('dps_medium')).toMatchObject({
      label: 'Medium-band DPS',
      beforeText: '16.5',
      afterText: '21.4',
      direction: 'good',
    });
    expect(metrics.get('dps_long')).toMatchObject({
      label: 'Long-band DPS',
      beforeText: '11.7',
      afterText: '15.2',
      direction: 'good',
    });
  });

  it('applies the authored combat factor for each abstract range band', () => {
    const design = stock('colossus_siege');
    design.mounts = [{ weaponId: 'lrm10', location: 'left_torso' }];

    expect(designDpsForBand(catalog, design, 'short')).toBeCloseTo(5.625, 8);
    expect(designDpsForBand(catalog, design, 'medium')).toBeCloseTo(4.6125, 8);
    expect(designDpsForBand(catalog, design, 'long')).toBeCloseTo(3.2625, 8);
  });

  it('resolves authored fire modes for alpha and efficiency-derived DPS', () => {
    const design = stock('redoubt_emplacement');
    design.mounts = [{ weaponId: 'lbx_ac10', location: 'centre_torso', modeId: 'slug' }];
    const weapon = structuredClone(catalog.weapons.get('lbx_ac10'));
    if (weapon === undefined) throw new Error('missing canister cannon fixture');
    const slug = weapon.modes.find((mode) => mode.id === 'slug');
    if (slug === undefined) throw new Error('missing slug mode fixture');
    slug.cooldown = 6;
    const modeCatalog: Catalog = {
      ...catalog,
      weapons: new Map(catalog.weapons).set(weapon.id, weapon),
    };

    expect(designAlphaDamage(catalog, design)).toBeCloseTo(13.2, 8);
    expect(designDpsForBand(modeCatalog, design, 'short')).toBeCloseTo(2.2, 8);
  });

  it('matches live chassis speed semantics, including traits and immobile frames', () => {
    const halberd = buildMetrics(catalog, stock('halberd_prime'));
    const redoubt = buildMetrics(catalog, stock('redoubt_emplacement'));

    expect(halberd.speed).toBeCloseTo((340 / 75) * 3 * 1.12, 8);
    expect(redoubt.speed).toBe(0);
  });

  it('chooses the authored stock design by chassis even after a custom rename', () => {
    const current = stock('colossus_siege');
    current.id = 'custom_colossus';
    current.name = 'Custom Colossus';

    expect(stockDesignFor(catalog, current)?.id).toBe('colossus_siege');
    expect(compareBuildToStock(catalog, current)).toMatchObject({
      baselineId: 'colossus_siege',
      currentId: 'custom_colossus',
    });
  });

  it('colors only changes that survive display rounding', () => {
    expect(displayedDirection(1.04, 1.03, 1)).toBe('neutral');
    expect(displayedDirection(1.04, 1.16, 1)).toBe('good');
    expect(displayedDirection(1.16, 1.04, 1)).toBe('bad');
  });

  it('derives delta text from the same rounded endpoints players see', () => {
    const baseline = stock('bulwark_assault');
    const current = structuredClone(baseline);
    current.heatSinks += 1;
    const heat = compareBuilds(catalog, baseline, current).metrics.find(
      (entry) => entry.id === 'heat_margin',
    );

    expect(heat).toMatchObject({
      beforeText: '-3.8',
      afterText: '-3.5',
      deltaText: '+0.3',
      directionText: 'increased by 0.3 heat/s',
      direction: 'good',
    });
  });
});
