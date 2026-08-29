import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { weaponEfficiency } from '../../sim/balance';
import { computeHeatProfile, computeLoadout } from '../../sim/loadout';
import { weaponFireProfile } from '../../sim/weaponModes';

export const BUILD_COMPARE_BANDS = [
  { id: 'short', label: 'Short-band', factor: 'short' },
  { id: 'medium', label: 'Medium-band', factor: 'medium' },
  { id: 'long', label: 'Long-band', factor: 'long' },
] as const;

export type BuildCompareRangeId = (typeof BUILD_COMPARE_BANDS)[number]['id'];
export type BuildCompareMetricId =
  | 'speed'
  | 'armour'
  | 'heat_margin'
  | 'alpha_damage'
  | 'dps_short'
  | 'dps_medium'
  | 'dps_long';
export type BuildCompareDirection = 'good' | 'bad' | 'neutral';

export interface BuildMetrics {
  readonly speed: number;
  readonly armour: number;
  readonly heatMargin: number;
  readonly alphaDamage: number;
  readonly dps: Readonly<Record<BuildCompareRangeId, number>>;
}

export interface BuildCompareMetric {
  readonly id: BuildCompareMetricId;
  readonly label: string;
  readonly unit: string;
  readonly before: number;
  readonly after: number;
  readonly beforeText: string;
  readonly afterText: string;
  readonly deltaText: string;
  readonly directionText: string;
  readonly direction: BuildCompareDirection;
}

export interface BuildComparison {
  readonly baselineId: string;
  readonly baselineName: string;
  readonly currentId: string;
  readonly currentName: string;
  readonly before: BuildMetrics;
  readonly after: BuildMetrics;
  readonly metrics: readonly BuildCompareMetric[];
}

export function designWalkSpeed(catalog: Catalog, design: Design): number {
  const chassis = catalog.chassis.get(design.chassisId);
  if (chassis === undefined) return 0;
  const frame = catalog.rules.frames.entries[chassis.frame];
  if (frame?.mobile !== true) return 0;
  const traitFactor = chassis.traits.reduce(
    (factor, id) => factor * (catalog.rules.traits.entries[id]?.speedFactor ?? 1),
    1,
  );
  return (
    (chassis.engineRating / chassis.tonnage) *
    catalog.rules.movement.walkSpeedFactor *
    traitFactor
  );
}

export function designDpsForBand(
  catalog: Catalog,
  design: Design,
  band: BuildCompareRangeId,
): number {
  let total = 0;
  for (const mount of design.mounts) {
    const weapon = catalog.weapons.get(mount.weaponId);
    if (weapon === undefined) continue;
    total += weaponEfficiency(catalog, weapon, mount.modeId ?? null).dps;
  }
  return total * catalog.rules.combat.rangeFactor[band];
}

export function designAlphaDamage(catalog: Catalog, design: Design): number {
  let total = 0;
  for (const mount of design.mounts) {
    const weapon = catalog.weapons.get(mount.weaponId);
    if (weapon === undefined) continue;
    const profile = weaponFireProfile(weapon, mount.modeId);
    total += profile.damage * profile.projectiles;
  }
  return total;
}

export function buildMetrics(catalog: Catalog, design: Design): BuildMetrics {
  const loadout = computeLoadout(catalog, design);
  const heat = computeHeatProfile(catalog, design);
  const dps = Object.fromEntries(
    BUILD_COMPARE_BANDS.map(({ id }) => [
      id,
      designDpsForBand(catalog, design, id),
    ]),
  ) as Record<BuildCompareRangeId, number>;

  return {
    speed: designWalkSpeed(catalog, design),
    armour: loadout.armourPoints,
    heatMargin: heat.dissipationPerSecond - heat.heatPerSecond,
    alphaDamage: designAlphaDamage(catalog, design),
    dps,
  };
}

function displayedNumber(value: number, decimals: number): number {
  const rounded = Number(value.toFixed(decimals));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function displayedDirection(
  before: number,
  after: number,
  decimals: number,
): BuildCompareDirection {
  const shownBefore = displayedNumber(before, decimals);
  const shownAfter = displayedNumber(after, decimals);
  if (shownAfter > shownBefore) return 'good';
  if (shownAfter < shownBefore) return 'bad';
  return 'neutral';
}

function displayValue(value: number, decimals: number, signed = false): string {
  const rounded = displayedNumber(value, decimals);
  const text = rounded.toFixed(decimals);
  return signed && rounded > 0 ? `+${text}` : text;
}

function metric(
  id: BuildCompareMetricId,
  label: string,
  unit: string,
  before: number,
  after: number,
  decimals: number,
  signed = false,
): BuildCompareMetric {
  const shownBefore = displayedNumber(before, decimals);
  const shownAfter = displayedNumber(after, decimals);
  const direction = displayedDirection(before, after, decimals);
  const shownDelta = displayedNumber(shownAfter - shownBefore, decimals);
  const magnitude = Math.abs(shownDelta).toFixed(decimals);
  const deltaText = direction === 'neutral'
    ? 'same'
    : `${shownDelta > 0 ? '+' : '−'}${magnitude}`;
  const directionText = direction === 'neutral'
    ? 'unchanged'
    : `${direction === 'good' ? 'increased' : 'decreased'} by ${magnitude} ${unit}`;
  return {
    id,
    label,
    unit,
    before,
    after,
    beforeText: displayValue(before, decimals, signed),
    afterText: displayValue(after, decimals, signed),
    deltaText,
    directionText,
    direction,
  };
}

export function compareBuilds(
  catalog: Catalog,
  baseline: Design,
  current: Design,
): BuildComparison {
  const before = buildMetrics(catalog, baseline);
  const after = buildMetrics(catalog, current);
  const metrics: BuildCompareMetric[] = [
    metric('speed', 'Speed', 'm/s', before.speed, after.speed, 1),
    metric('armour', 'Armour', 'pts', before.armour, after.armour, 0),
    metric(
      'heat_margin',
      'Heat margin',
      'heat/s',
      before.heatMargin,
      after.heatMargin,
      1,
      true,
    ),
    metric('alpha_damage', 'Alpha', 'damage', before.alphaDamage, after.alphaDamage, 1),
    ...BUILD_COMPARE_BANDS.map(({ id, label }) =>
      metric(
        `dps_${id}`,
        `${label} DPS`,
        'damage/s',
        before.dps[id],
        after.dps[id],
        1,
      ),
    ),
  ];

  return {
    baselineId: baseline.id,
    baselineName: baseline.name,
    currentId: current.id,
    currentName: current.name,
    before,
    after,
    metrics,
  };
}

export function stockDesignFor(catalog: Catalog, current: Design): Design | null {
  const exact = catalog.designs.get(current.id);
  if (exact?.chassisId === current.chassisId) return exact;
  return [...catalog.designs.values()]
    .filter((design) => design.chassisId === current.chassisId)
    .sort((left, right) => left.id.localeCompare(right.id))[0] ?? null;
}

export function compareBuildToStock(
  catalog: Catalog,
  current: Design,
): BuildComparison | null {
  const stock = stockDesignFor(catalog, current);
  return stock === null ? null : compareBuilds(catalog, stock, current);
}
