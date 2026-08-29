import type { WeaponMountSpec } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import type { Weapon } from '../../schema/weapon';
import { weaponEfficiency } from '../../sim/balance';

export const RANGE_DAMAGE_MAX_METRES = 600;

export interface MountedWeaponProfile {
  weapon: Weapon;
  modeId: string | null;
}

export interface DamageBand {
  start: number;
  end: number;
  dps: number;
}

export interface DamageSeries {
  id: string;
  weaponId: string;
  modeId: string | null;
  label: string;
  colour: string;
  count: number;
}

export interface StackedDamageLayer {
  seriesId: string;
  lower: number;
  upper: number;
  dps: number;
}

export interface StackedDamageBand {
  start: number;
  end: number;
  total: number;
  layers: readonly StackedDamageLayer[];
}

export interface WeaponDamageChart {
  bands: readonly DamageBand[];
  peak: number;
}

export interface LoadoutDamageChart {
  series: readonly DamageSeries[];
  bands: readonly StackedDamageBand[];
  peak: number;
}

function rangeFactor(catalog: Catalog, weapon: Weapon, metres: number): number {
  const factors = catalog.rules.combat.rangeFactor;
  if (metres <= weapon.range.short) return factors.short;
  if (metres <= weapon.range.medium) return factors.medium;
  if (metres <= weapon.range.long) return factors.long;
  return factors.beyond;
}

/** Neutral expected output before pilot, motion, cover, heat, or elevation modifiers. */
export function expectedWeaponDpsAtRange(
  catalog: Catalog,
  weapon: Weapon,
  metres: number,
  modeId: string | null = null,
): number {
  const maximumReach = weapon.range.long * catalog.rules.combat.maxRangeMultiplier;
  if (metres > maximumReach) return 0;
  const minimumFactor = metres < weapon.range.min
    ? catalog.rules.combat.minimumRangeFactor
    : 1;
  return weaponEfficiency(catalog, weapon, modeId).dps
    * rangeFactor(catalog, weapon, metres)
    * minimumFactor;
}

function breakpointsForWeapon(
  catalog: Catalog,
  weapon: Weapon,
  maximum: number,
): readonly number[] {
  return [
    0,
    weapon.range.min,
    weapon.range.short,
    weapon.range.medium,
    weapon.range.long,
    weapon.range.long * catalog.rules.combat.maxRangeMultiplier,
    maximum,
  ]
    .filter((value) => value >= 0 && value <= maximum)
    .sort((left, right) => left - right)
    .filter((value, index, values) => index === 0 || value !== values[index - 1]);
}

function bandsFromBreakpoints(
  breakpoints: readonly number[],
  dpsAt: (metres: number) => number,
): readonly DamageBand[] {
  const bands: DamageBand[] = [];
  for (let index = 0; index < breakpoints.length - 1; index += 1) {
    const start = breakpoints[index];
    const end = breakpoints[index + 1];
    if (start === undefined || end === undefined || end <= start) continue;
    bands.push({ start, end, dps: dpsAt((start + end) / 2) });
  }
  return bands;
}

export function weaponDamageChart(
  catalog: Catalog,
  weapon: Weapon,
  modeId: string | null = null,
  maximum: number = RANGE_DAMAGE_MAX_METRES,
): WeaponDamageChart {
  const bands = bandsFromBreakpoints(
    breakpointsForWeapon(catalog, weapon, maximum),
    (metres) => expectedWeaponDpsAtRange(catalog, weapon, metres, modeId),
  );
  return { bands, peak: Math.max(0, ...bands.map((band) => band.dps)) };
}

/** Resolve current design mounts without making StoreShelf duplicate schema lookups. */
export function mountedWeaponProfiles(
  catalog: Catalog,
  mounts: readonly WeaponMountSpec[],
): readonly MountedWeaponProfile[] {
  return mounts.flatMap((mount) => {
    const weapon = catalog.weapons.get(mount.weaponId);
    return weapon === undefined ? [] : [{ weapon, modeId: mount.modeId ?? null }];
  });
}

function groupedSeries(
  catalog: Catalog,
  mounted: readonly MountedWeaponProfile[],
): readonly DamageSeries[] {
  const groups = new Map<string, DamageSeries>();
  for (const profile of mounted) {
    const efficiency = weaponEfficiency(catalog, profile.weapon, profile.modeId);
    const id = `${profile.weapon.id}:${efficiency.modeId ?? 'base'}`;
    const existing = groups.get(id);
    if (existing !== undefined) {
      existing.count += 1;
      continue;
    }
    groups.set(id, {
      id,
      weaponId: profile.weapon.id,
      modeId: efficiency.modeId,
      label: efficiency.name,
      colour: profile.weapon.visual.colour,
      count: 1,
    });
  }
  return [...groups.values()];
}

export function loadoutDamageChart(
  catalog: Catalog,
  mounted: readonly MountedWeaponProfile[],
  maximum: number = RANGE_DAMAGE_MAX_METRES,
): LoadoutDamageChart {
  const series = groupedSeries(catalog, mounted);
  const profilesBySeries = new Map(
    series.map((entry) => [
      entry.id,
      mounted.find((profile) => {
        const efficiency = weaponEfficiency(catalog, profile.weapon, profile.modeId);
        return profile.weapon.id === entry.weaponId && efficiency.modeId === entry.modeId;
      }),
    ]),
  );
  const breakpoints = [
    0,
    maximum,
    ...series.flatMap((entry) => {
      const profile = profilesBySeries.get(entry.id);
      return profile === undefined
        ? []
        : breakpointsForWeapon(catalog, profile.weapon, maximum);
    }),
  ]
    .sort((left, right) => left - right)
    .filter((value, index, values) => index === 0 || value !== values[index - 1]);

  const bands: StackedDamageBand[] = [];
  for (let index = 0; index < breakpoints.length - 1; index += 1) {
    const start = breakpoints[index];
    const end = breakpoints[index + 1];
    if (start === undefined || end === undefined || end <= start) continue;
    const sample = (start + end) / 2;
    let lower = 0;
    const layers = series.map((entry) => {
      const profile = profilesBySeries.get(entry.id);
      const dps = profile === undefined
        ? 0
        : expectedWeaponDpsAtRange(catalog, profile.weapon, sample, entry.modeId) * entry.count;
      const layer = { seriesId: entry.id, lower, upper: lower + dps, dps };
      lower += dps;
      return layer;
    });
    bands.push({ start, end, total: lower, layers });
  }

  return { series, bands, peak: Math.max(0, ...bands.map((band) => band.total)) };
}
