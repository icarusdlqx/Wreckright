import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import {
  factionPresentation,
  normalisedWeaponMetrics,
  weaponCategory,
  weaponCostLine,
  weaponMetricMaxima,
  weaponCatalogMedians,
  weaponMetrics,
  weaponOperatingLine,
  weaponProfile,
  weaponTraitLines,
  weaponsByCategory,
  type WeaponCategory,
} from './weaponPresentation';

function weapon(id: string) {
  const entry = catalog.weapons.get(id);
  if (entry === undefined) throw new Error(`missing weapon ${id}`);
  return entry;
}

describe('weapon categories', () => {
  it('places every catalogue weapon in exactly one plain-English family', () => {
    const expected: Record<WeaponCategory, number> = {
      'machine-guns': 1,
      flamers: 1,
      'short-range-missiles': 3,
      autocannons: 3,
      'medium-range-missiles': 1,
      lasers: 9,
      'particle-weapons': 3,
      railguns: 1,
      'long-range-missiles': 2,
    };
    const groups = weaponsByCategory(catalog, [...catalog.weapons.values()]);
    const actual = Object.fromEntries(
      [...groups].map(([category, entries]) => [category, entries.length]),
    );

    expect(actual).toEqual(expected);
    expect([...groups.values()].flat()).toHaveLength(catalog.weapons.size);
  });

  it('keeps the catalogue exceptions out of misleading catch-all groups', () => {
    expect(weaponCategory(catalog, weapon('flamer'))).toBe('flamers');
    expect(weaponCategory(catalog, weapon('gauss_rifle'))).toBe('railguns');
    expect(weaponCategory(catalog, weapon('mrm20'))).toBe('medium-range-missiles');
    expect(weaponCategory(catalog, weapon('lrm20'))).toBe('long-range-missiles');
  });
});

describe('weapon comparison metrics', () => {
  it('uses fixed whole-catalogue maxima', () => {
    const maxima = weaponMetricMaxima(catalog);
    const longshot = weapon('lrm20');
    expect(maxima.damage).toBeCloseTo((longshot.damage * longshot.projectiles) / longshot.cooldown, 8);
    expect(maxima.reach).toBe(540);
    expect(maxima.heat).toBe(4.5);
  });

  it('measures sustained damage, authored reach, and sustained heat', () => {
    const longshot = weapon('lrm20');
    const metrics = weaponMetrics(longshot);
    expect(metrics.damage).toBeCloseTo((longshot.damage * longshot.projectiles) / longshot.cooldown, 8);
    expect(metrics.reach).toBe(540);
    expect(metrics.heat).toBeCloseTo(longshot.heat / longshot.cooldown, 8);
    expect(weaponMetrics(weapon('machine_gun'))).toEqual({ damage: 1.2, reach: 90, heat: 1 });
  });

  it('keeps every fill bounded without changing maxima with a shelf filter', () => {
    const maxima = weaponMetricMaxima(catalog);
    const filtered = [...catalog.weapons.values()].filter((entry) => entry.type === 'energy');
    const fills = filtered.map((entry) => normalisedWeaponMetrics(entry, maxima));

    for (const metrics of fills) {
      expect(Object.values(metrics).every((value) => value >= 0 && value <= 1)).toBe(true);
    }
    expect(maxima).toEqual(weaponMetricMaxima(catalog));
  });
});

describe('truthful generated copy', () => {
  it('states fitting, heat and ammunition burdens without arithmetic', () => {
    expect(weaponCostLine(weapon('ac5'))).toBe(
      '8 tons, 4 slots; adds 0.5 heat/s; 1 ton of ammo lasts 40s at full cycle.',
    );
    expect(weaponCostLine(weapon('large_laser'))).toBe(
      '5 tons, 2 slots; adds 2.29 heat/s; needs no ammunition.',
    );
  });

  it('does not pretend the simulated flamer has an ammunition bin', () => {
    expect(weaponCostLine(weapon('flamer'))).toContain('no separate fuel bin is tracked');
    expect(weaponOperatingLine(weapon('flamer'))).toContain('loadout tracks no separate fuel bin');
    expect(weaponTraitLines(catalog, weapon('flamer'))).toContain('Adds 4 heat to the target');
  });

  it('describes the real minimum-range modifier and never promises indirect fire', () => {
    expect(weaponTraitLines(catalog, weapon('ppc'))).toContain('50% accuracy inside 30m');
    const generated = [...catalog.weapons.values()]
      .flatMap((entry) => [
        weaponCostLine(entry),
        weaponOperatingLine(entry),
        ...weaponTraitLines(catalog, entry),
      ])
      .join(' ')
      .toLowerCase();
    expect(generated).not.toMatch(/dead inside|lobs over cover|indirect fire|reactor power/);
    expect(weaponOperatingLine(weapon('srm6'))).toContain('line of sight is still required');
    expect(weaponOperatingLine(weapon('lrm10'))).toContain(
      'arcs onto a live sensor track without line of sight',
    );
  });

  it('exposes faction labels for text-and-colour treatment', () => {
    expect(factionPresentation('linewrought')).toEqual({
      label: 'Linewrought',
      className: 'faction-linewrought',
    });
    expect(factionPresentation('aurelian').label).toBe('Aurelian Stock');
  });
});

describe('weapon role and verdict', () => {
  const medians = weaponCatalogMedians(catalog);

  it('judges hot, cold and long against the middle of the catalogue', () => {
    const reaches = [...catalog.weapons.values()].map((entry) => weaponMetrics(entry).reach);
    const sorted = [...reaches].sort((a, b) => a - b);
    const middle = sorted.length / 2;
    expect(medians.reach).toBe(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
    expect(medians.recoil).toBeGreaterThan(0);
    expect(medians.ammoPerTon).toBeGreaterThan(0);
  });

  it('calls the gauss rifle a cold long-range sniper that explodes when breached', () => {
    expect(weaponProfile(catalog, weapon('gauss_rifle'), medians)).toEqual({
      role: 'Long-range sniper',
      strengths: ['Runs cold', 'Cripples what it hits'],
      weakness: 'Explodes if the mount is breached',
    });
  });

  it('calls the AC/20 a hammer that knocks targets and runs out of rounds', () => {
    const profile = weaponProfile(catalog, weapon('ac20'), medians);
    expect(profile.role).toMatch(/hammer$/);
    expect(profile.strengths).toEqual(['Cripples what it hits', 'Knocks targets']);
    expect(profile.weakness).toBe('5 rounds a ton');
  });

  it('calls the LRM 20 indirect artillery that fires over cover but struggles up close', () => {
    const profile = weaponProfile(catalog, weapon('lrm20'), medians);
    expect(profile.role).toBe('Indirect artillery');
    expect(profile.strengths[0]).toBe('Fires over cover');
    expect(profile.strengths.length).toBeLessThanOrEqual(2);
    expect(profile.weakness).toBe('Struggles inside 60m');
  });

  it('calls the flamer a heat weapon and never claims it needs no ammo', () => {
    const profile = weaponProfile(catalog, weapon('flamer'), medians);
    expect(profile.role).toBe('Heat weapon');
    expect(profile.strengths).toContain('Heats the target');
    expect(profile.strengths).not.toContain('No ammo');
    expect(profile.weakness).toBe('Short reach');
  });

  it('calls the PPC an ammo-free energy cannon with a minimum range', () => {
    const profile = weaponProfile(catalog, weapon('ppc'), medians);
    expect(profile.role).toMatch(/^(Long|Mid)-range energy cannon$/);
    expect(profile.strengths).toContain('No ammo');
    expect(profile.weakness).toBe('Struggles inside 30m');
  });

  it('calls the SRM 6 a close-range missile spread with short reach', () => {
    const profile = weaponProfile(catalog, weapon('srm6'), medians);
    expect(profile.role).toBe('Close-range missile spread');
    expect(profile.strengths.length).toBeLessThanOrEqual(2);
    expect(profile.weakness).toBe('Short reach');
  });

  it('gives every catalogue weapon a role, at most two strengths, and short phrases', () => {
    for (const entry of catalog.weapons.values()) {
      const profile = weaponProfile(catalog, entry, medians);
      expect(profile.role.length).toBeGreaterThan(0);
      expect(profile.strengths.length).toBeLessThanOrEqual(2);
      for (const phrase of [profile.role, ...profile.strengths, profile.weakness ?? '']) {
        expect(phrase.length).toBeLessThanOrEqual(40);
      }
    }
  });
});
