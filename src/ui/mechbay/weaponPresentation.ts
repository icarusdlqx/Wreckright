import type { Faction } from '../../schema/faction';
import type { Catalog } from '../../schema/load';
import type { Weapon } from '../../schema/weapon';
import { machineCulturePresentation } from './machineCulturePresentation';

export const WEAPON_CATEGORIES = [
  { id: 'machine-guns', label: 'Machine Guns' },
  { id: 'flamers', label: 'Flamers' },
  { id: 'short-range-missiles', label: 'Short-Range Missiles' },
  { id: 'autocannons', label: 'Autocannons' },
  { id: 'medium-range-missiles', label: 'Medium-Range Missiles' },
  { id: 'lasers', label: 'Lasers' },
  { id: 'particle-weapons', label: 'Particle Weapons' },
  { id: 'railguns', label: 'Railguns' },
  { id: 'long-range-missiles', label: 'Long-Range Missiles' },
] as const;

export type WeaponCategory = (typeof WEAPON_CATEGORIES)[number]['id'];

export interface WeaponMetrics {
  /** Damage delivered per second when the weapon cycles continuously. */
  damage: number;
  /** End of the authored long-range bracket, in metres. */
  reach: number;
  /** Heat added per second when the weapon cycles continuously. */
  heat: number;
}

export interface NormalisedWeaponMetrics {
  damage: number;
  reach: number;
  heat: number;
}

export function weaponCategory(catalog: Catalog, weapon: Weapon): WeaponCategory {
  if (weapon.visual.style === 'flame') return 'flamers';

  if (weapon.type === 'missile') {
    if (
      weapon.tags.includes('indirect_fire') ||
      weapon.range.long >= catalog.rules.ai.roles.longRangeMetres
    ) {
      return 'long-range-missiles';
    }
    if (weapon.range.long <= catalog.rules.ai.roles.shortRangeMetres) {
      return 'short-range-missiles';
    }
    return 'medium-range-missiles';
  }

  if (weapon.type === 'ballistic') {
    if (weapon.id === 'machine_gun') return 'machine-guns';
    if (weapon.visual.style === 'slug') return 'railguns';
    return 'autocannons';
  }

  return weapon.visual.style === 'bolt' ? 'particle-weapons' : 'lasers';
}

export function weaponCategoryLabel(category: WeaponCategory): string {
  return WEAPON_CATEGORIES.find((entry) => entry.id === category)?.label ?? category;
}

export function weaponsByCategory(
  catalog: Catalog,
  weapons: readonly Weapon[],
): ReadonlyMap<WeaponCategory, readonly Weapon[]> {
  const groups = new Map<WeaponCategory, Weapon[]>();
  for (const category of WEAPON_CATEGORIES) groups.set(category.id, []);
  for (const weapon of weapons) groups.get(weaponCategory(catalog, weapon))?.push(weapon);
  return groups;
}

export function weaponMetrics(weapon: Weapon): WeaponMetrics {
  return {
    damage: (weapon.damage * weapon.projectiles) / weapon.cooldown,
    reach: weapon.range.long,
    heat: weapon.heat / weapon.cooldown,
  };
}

export function weaponMetricMaxima(catalog: Catalog): WeaponMetrics {
  const maxima: WeaponMetrics = { damage: 0, reach: 0, heat: 0 };
  for (const weapon of catalog.weapons.values()) {
    const metrics = weaponMetrics(weapon);
    maxima.damage = Math.max(maxima.damage, metrics.damage);
    maxima.reach = Math.max(maxima.reach, metrics.reach);
    maxima.heat = Math.max(maxima.heat, metrics.heat);
  }
  return maxima;
}

function normalise(value: number, maximum: number): number {
  if (maximum <= 0) return 0;
  return Math.max(0, Math.min(1, value / maximum));
}

export function normalisedWeaponMetrics(
  weapon: Weapon,
  maxima: WeaponMetrics,
): NormalisedWeaponMetrics {
  const metrics = weaponMetrics(weapon);
  return {
    damage: normalise(metrics.damage, maxima.damage),
    reach: normalise(metrics.reach, maxima.reach),
    heat: normalise(metrics.heat, maxima.heat),
  };
}

export function formatWeaponNumber(value: number, places = 2): string {
  return value.toFixed(places).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function noun(value: number, singular: string): string {
  return `${formatWeaponNumber(value)} ${singular}${value === 1 ? '' : 's'}`;
}

export function ammoEnduranceSeconds(weapon: Weapon): number | null {
  return weapon.ammoPerTon === null ? null : weapon.ammoPerTon * weapon.cooldown;
}

export function weaponCostLine(weapon: Weapon): string {
  const endurance = ammoEnduranceSeconds(weapon);
  const ammunition =
    weapon.visual.style === 'flame'
      ? 'no separate fuel bin is tracked'
      : endurance === null
        ? 'needs no ammunition'
        : `1 ton of ammo lasts ${formatWeaponNumber(endurance)}s at full cycle`;
  return `${noun(weapon.tonnage, 'ton')}, ${noun(weapon.slots, 'slot')}; adds ${formatWeaponNumber(weaponMetrics(weapon).heat)} heat/s; ${ammunition}.`;
}

export function weaponOperatingLine(weapon: Weapon): string {
  if (weapon.visual.style === 'flame') {
    return 'Close-range heat weapon; the loadout tracks no separate fuel bin.';
  }
  if (weapon.type === 'energy') {
    return 'Needs no ammunition; sustained fire is limited by heat.';
  }
  if (weapon.type === 'missile') {
    return weapon.tags.includes('indirect_fire')
      ? 'Travelling cluster with a finite magazine; arcs onto a live sensor track without line of sight.'
      : 'Travelling cluster with a finite magazine; line of sight is still required.';
  }
  return 'Cooler sustained fire with a finite magazine and a vulnerable ammunition bin.';
}

export function weaponTraitLines(catalog: Catalog, weapon: Weapon): readonly string[] {
  const traits: string[] = [];
  if (weapon.projectiles > 1) traits.push(`${weapon.projectiles}-hit spread`);
  if (weapon.accuracy !== 1) {
    const difference = Math.round(Math.abs(weapon.accuracy - 1) * 100);
    traits.push(`${difference}% ${weapon.accuracy > 1 ? 'better' : 'worse'} tracking`);
  }
  if (weapon.range.min > 0) {
    traits.push(
      `${Math.round(catalog.rules.combat.minimumRangeFactor * 100)}% accuracy inside ${weapon.range.min}m`,
    );
  }
  if (weapon.targetHeat > 0) {
    traits.push(`Adds ${formatWeaponNumber(weapon.targetHeat)} heat to the target`);
  }
  if (weapon.tags.includes('volatile')) traits.push('Mount can detonate when breached');
  return traits;
}

export function factionPresentation(faction: Faction): { label: string; className: string } {
  return {
    label: machineCulturePresentation(faction).originLabel,
    className: `faction-${faction}`,
  };
}

export function isForeignPattern(weapon: Weapon, chassisFaction: Faction | undefined): boolean {
  return chassisFaction !== undefined && weapon.faction !== chassisFaction;
}

export interface WeaponMedians {
  damage: number;
  reach: number;
  heat: number;
  criticalChance: number;
  /** Among guns that kick at all; a beam has no recoil to be compared against. */
  recoil: number;
  /** Among magazine-fed guns only. */
  ammoPerTon: number;
  tonnage: number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + upper) / 2 : upper;
}

/** The middle of the catalogue, so "hot" and "long" mean hot and long today. */
export function weaponCatalogMedians(catalog: Catalog): WeaponMedians {
  const weapons = [...catalog.weapons.values()];
  const metrics = weapons.map(weaponMetrics);
  return {
    damage: median(metrics.map((entry) => entry.damage)),
    reach: median(metrics.map((entry) => entry.reach)),
    heat: median(metrics.map((entry) => entry.heat)),
    criticalChance: median(weapons.map((weapon) => weapon.criticalChance)),
    recoil: median(weapons.filter((weapon) => weapon.recoil > 0).map((weapon) => weapon.recoil)),
    ammoPerTon: median(
      weapons.flatMap((weapon) => (weapon.ammoPerTon === null ? [] : [weapon.ammoPerTon])),
    ),
    tonnage: median(weapons.map((weapon) => weapon.tonnage)),
  };
}

export interface WeaponProfile {
  /** What the gun is for, in three or four words. */
  role: string;
  strengths: readonly string[];
  weakness: string | null;
}

type Standing = 'low' | 'typical' | 'high';

function standing(value: number, middle: number, band: number): Standing {
  if (value > middle * (1 + band)) return 'high';
  if (value < middle * (1 - band)) return 'low';
  return 'typical';
}

function roleNoun(weapon: Weapon, damage: Standing): string {
  if (weapon.type === 'missile') {
    return weapon.projectiles > 1 ? 'missile spread' : 'missile launcher';
  }
  if (weapon.type === 'ballistic') {
    if (weapon.visual.style === 'slug') return 'sniper';
    if (weapon.projectiles > 1) return 'cluster cannon';
    return damage === 'high' ? 'hammer' : 'autocannon';
  }
  if (weapon.visual.style === 'bolt') return 'energy cannon';
  if (weapon.visual.style === 'pulse') return 'pulse laser';
  return damage === 'high' ? 'heavy laser' : 'laser';
}

/**
 * The card's one-line verdict, judged against the rest of the catalogue rather
 * than against fixed numbers, so a rebalance moves the labels with it. The
 * tolerance is the same band the balance report uses to call a weapon typical.
 */
export function weaponProfile(
  catalog: Catalog,
  weapon: Weapon,
  medians: WeaponMedians = weaponCatalogMedians(catalog),
): WeaponProfile {
  const band = catalog.rules.balance.weaponBandFraction;
  const metrics = weaponMetrics(weapon);
  const reach = standing(metrics.reach, medians.reach, band);
  const heat = standing(metrics.heat, medians.heat, band);
  const damage = standing(metrics.damage, medians.damage, band);
  const crit = standing(weapon.criticalChance, medians.criticalChance, band);
  const recoil = weapon.recoil > 0 ? standing(weapon.recoil, medians.recoil, band) : 'low';
  const ammo = weapon.ammoPerTon === null ? null : standing(weapon.ammoPerTon, medians.ammoPerTon, band);
  const weight = standing(weapon.tonnage, medians.tonnage, band);
  const indirect = weapon.tags.includes('indirect_fire');
  const flame = weapon.visual.style === 'flame';

  const rangeWord = reach === 'high' ? 'Long-range' : reach === 'low' ? 'Close-range' : 'Mid-range';
  const role = flame
    ? 'Heat weapon'
    : indirect
      ? 'Indirect artillery'
      : `${rangeWord} ${roleNoun(weapon, damage)}`;

  const strengths = [
    indirect ? 'Fires over cover' : null,
    heat === 'low' ? 'Runs cold' : null,
    weapon.ammoPerTon === null && !flame ? 'No ammo' : null,
    weapon.targetHeat > 0 ? 'Heats the target' : null,
    weapon.accuracy > 1 ? 'Tracks moving targets' : null,
    crit === 'high' ? 'Cripples what it hits' : null,
    recoil === 'high' ? 'Knocks targets' : null,
    damage === 'high' ? 'Hits hard' : null,
    weight === 'low' ? 'Weighs little' : null,
    weapon.projectiles > 1 && weapon.type !== 'missile' ? 'Spreads its hits' : null,
  ].filter((entry): entry is string => entry !== null).slice(0, 2);

  const weakness = weapon.tags.includes('volatile')
    ? 'Explodes if the mount is breached'
    : weapon.range.min > 0
      ? `Struggles inside ${weapon.range.min}m`
      : heat === 'high'
        ? 'Hot'
        : ammo === 'low'
          ? `${weapon.ammoPerTon} rounds a ton`
          : weapon.accuracy < 1
            ? 'Scatters'
            : reach === 'low'
              ? 'Short reach'
              : damage === 'low'
                ? 'Weak hitter'
                : weight === 'high'
                  ? 'Heavy'
                  : null;

  return { role, strengths, weakness };
}
