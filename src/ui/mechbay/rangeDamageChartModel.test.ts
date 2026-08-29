import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import type { Weapon } from '../../schema/weapon';
import {
  expectedWeaponDpsAtRange,
  loadoutDamageChart,
  mountedWeaponProfiles,
  weaponDamageChart,
} from './rangeDamageChartModel';

function weapon(id: string): Weapon {
  const entry = catalog.weapons.get(id);
  if (entry === undefined) throw new Error(`missing weapon ${id}`);
  return entry;
}

describe('range damage chart model', () => {
  it('mirrors every Longshot boundary and its real 50% minimum-range notch', () => {
    const longshot = weapon('lrm10');
    expect(expectedWeaponDpsAtRange(catalog, longshot, 0)).toBeCloseTo(2.8125, 8);
    expect(expectedWeaponDpsAtRange(catalog, longshot, 59.999)).toBeCloseTo(2.8125, 8);
    expect(expectedWeaponDpsAtRange(catalog, longshot, 60)).toBeCloseTo(5.625, 8);
    expect(expectedWeaponDpsAtRange(catalog, longshot, 180)).toBeCloseTo(5.625, 8);
    expect(expectedWeaponDpsAtRange(catalog, longshot, 180.001)).toBeCloseTo(4.6125, 8);
    expect(expectedWeaponDpsAtRange(catalog, longshot, 350)).toBeCloseTo(4.6125, 8);
    expect(expectedWeaponDpsAtRange(catalog, longshot, 350.001)).toBeCloseTo(3.2625, 8);
    expect(expectedWeaponDpsAtRange(catalog, longshot, 540)).toBeCloseTo(3.2625, 8);
    expect(expectedWeaponDpsAtRange(catalog, longshot, 540.001)).toBeCloseTo(0.675, 8);
    expect(expectedWeaponDpsAtRange(catalog, longshot, 600)).toBeCloseTo(0.675, 8);
    expect(expectedWeaponDpsAtRange(catalog, longshot, 675)).toBeCloseTo(0.675, 8);
    expect(expectedWeaponDpsAtRange(catalog, longshot, 675.001)).toBe(0);
  });

  it('builds fixed-domain step bands with a visible 0-60m dip', () => {
    const chart = weaponDamageChart(catalog, weapon('lrm10'));
    expect(chart.bands.map(({ start, end }) => [start, end])).toEqual([
      [0, 60],
      [60, 180],
      [180, 350],
      [350, 540],
      [540, 600],
    ]);
    expect(chart.bands[0]?.dps).toBeCloseTo(2.8125, 8);
    expect(chart.bands[1]?.dps).toBeCloseTo(5.625, 8);
    expect(chart.peak).toBeCloseTo(5.625, 8);
  });

  it('stacks every Drover mount and preserves the whole-loadout notch', () => {
    const drover = catalog.designs.get('drover_carrier');
    if (drover === undefined) throw new Error('missing Drover carrier');
    const profiles = mountedWeaponProfiles(catalog, drover.mounts);
    const chart = loadoutDamageChart(catalog, profiles);

    expect(profiles).toHaveLength(3);
    expect(chart.series.map(({ weaponId, count }) => [weaponId, count])).toEqual([
      ['lrm20', 1],
      ['lrm10', 2],
    ]);
    expect(chart.bands.find(({ start, end }) => start === 0 && end === 60)?.total)
      .toBeCloseTo(10.75, 8);
    expect(chart.bands.find(({ start, end }) => start === 60 && end === 180)?.total)
      .toBeCloseTo(21.5, 8);
    expect(chart.bands.find(({ start, end }) => start === 180 && end === 350)?.total)
      .toBeCloseTo(17.63, 8);
    expect(chart.bands.find(({ start, end }) => start === 350 && end === 540)?.total)
      .toBeCloseTo(12.47, 8);
    expect(chart.bands.find(({ start, end }) => start === 540 && end === 600)?.total)
      .toBeCloseTo(2.58, 8);
    expect(chart.bands.every((band) => band.layers.length === 2)).toBe(true);
  });

  it('keeps a zero-height band after the whole loadout runs out of reach', () => {
    const chart = loadoutDamageChart(catalog, [
      { weapon: weapon('streak_srm6'), modeId: null },
    ]);
    const deadZone = chart.bands.find(({ start, end }) => start === 187.5 && end === 600);
    expect(deadZone?.total).toBe(0);
    expect(deadZone?.layers[0]?.dps).toBe(0);
  });

  it('uses active modal profiles and skips unknown design weapons', () => {
    const modal = weapon('lbx_ac10');
    const modes = modal.modes.map((mode) => mode.id);
    expect(modes).toHaveLength(2);
    const distinctModal: Weapon = {
      ...modal,
      modes: modal.modes.map((mode, index) =>
        index === 1 ? { ...mode, cooldown: 6 } : mode),
    };
    const first = expectedWeaponDpsAtRange(catalog, distinctModal, 0, modes[0] ?? null);
    const second = expectedWeaponDpsAtRange(catalog, distinctModal, 0, modes[1] ?? null);
    expect(first).toBeCloseTo(4.4, 8);
    expect(second).toBeCloseTo(2.2, 8);

    const modalCatalog = {
      ...catalog,
      weapons: new Map(catalog.weapons).set(modal.id, distinctModal),
    };

    const profiles = mountedWeaponProfiles(modalCatalog, [
      { weaponId: 'not_authored', location: 'head' },
      { weaponId: modal.id, location: 'centre_torso', modeId: modes[1] },
    ]);
    const chart = loadoutDamageChart(modalCatalog, profiles);
    expect(profiles).toHaveLength(1);
    expect(chart.series[0]?.modeId).toBe(modes[1]);
    expect(chart.bands[0]?.total).toBeCloseTo(2.2, 8);
  });
});
