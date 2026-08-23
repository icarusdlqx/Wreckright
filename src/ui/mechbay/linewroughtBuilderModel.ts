import { LOCATIONS } from '../../schema/common';
import type { Chassis } from '../../schema/chassis';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import type { WeaponType } from '../../schema/weapon';
import { activeArmourLocations } from '../../sim/designArmour';
import { blankDesign, idFromName } from './editor';

export type LinewroughtBuilderMode = 'bare' | 'recipe';

export interface HardpointCapacity {
  readonly type: WeaponType;
  readonly count: number;
  readonly maximumSize: number | null;
}

export interface FrameTraitSummary {
  readonly id: string;
  readonly label: string;
  readonly note: string;
}

export interface LinewroughtFrameSummary {
  readonly chassis: Chassis;
  readonly tonnage: number;
  readonly walkSpeed: number;
  readonly totalSlots: number;
  readonly activeArmourCapacity: number;
  readonly hardpoints: readonly HardpointCapacity[];
  readonly traits: readonly FrameTraitSummary[];
  readonly strongSuit: string;
  readonly tradeoff: string;
}

export interface LinewroughtDraftRequest {
  readonly chassisId: string;
  readonly mode: LinewroughtBuilderMode;
  readonly name: string;
  readonly recipeId?: string;
}

const HARDPOINT_TYPES: readonly WeaponType[] = ['energy', 'ballistic', 'missile'];

interface ComparableFrame {
  readonly chassis: Chassis;
  readonly walkSpeed: number;
  readonly totalSlots: number;
  readonly activeArmourCapacity: number;
}

interface ComparisonMetric {
  readonly id: 'mobility' | 'fitting' | 'armour';
  readonly label: string;
  readonly value: number;
  readonly display: string;
}

function speedFor(catalog: Catalog, chassis: Chassis): number {
  const traitFactor = chassis.traits.reduce((factor, traitId) => (
    factor * (catalog.rules.traits.entries[traitId]?.speedFactor ?? 1)
  ), 1);
  return (
    (chassis.engineRating / chassis.tonnage)
    * catalog.rules.movement.walkSpeedFactor
    * traitFactor
  );
}

function baseFrame(catalog: Catalog, chassis: Chassis): ComparableFrame {
  const active = activeArmourLocations(catalog.rules, chassis.frame);
  return {
    chassis,
    walkSpeed: speedFor(catalog, chassis),
    totalSlots: LOCATIONS.reduce(
      (total, location) => total + chassis.hardpoints[location].slots,
      0,
    ),
    activeArmourCapacity: active.reduce(
      (total, location) => total + chassis.armourMax[location],
      0,
    ),
  };
}

function frameMetrics(frame: ComparableFrame): readonly ComparisonMetric[] {
  return [
    {
      id: 'mobility',
      label: 'Walking pace',
      value: frame.walkSpeed,
      display: `${frame.walkSpeed.toFixed(0)} m/s`,
    },
    {
      id: 'fitting',
      label: 'Fitting space',
      value: frame.totalSlots,
      display: `${frame.totalSlots} slots`,
    },
    {
      id: 'armour',
      label: 'Armour ceiling',
      value: frame.activeArmourCapacity,
      display: `${frame.activeArmourCapacity} points`,
    },
  ];
}

function relativeScore(
  frames: readonly ComparableFrame[],
  metric: ComparisonMetric['id'],
  value: number,
): number {
  const values = frames.map((frame) => (
    frameMetrics(frame).find((entry) => entry.id === metric)?.value ?? value
  ));
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return maximum === minimum ? 0.5 : (value - minimum) / (maximum - minimum);
}

function comparisonCopy(
  frames: readonly ComparableFrame[],
  frame: ComparableFrame,
): { strongSuit: string; tradeoff: string } {
  const ranked = frameMetrics(frame).map((metric, order) => ({
    ...metric,
    order,
    score: relativeScore(frames, metric.id, metric.value),
  }));
  const strongest = [...ranked].sort((a, b) => b.score - a.score || a.order - b.order)[0];
  const tightest = [...ranked]
    .filter((entry) => entry.id !== strongest?.id)
    .sort((a, b) => a.score - b.score || a.order - b.order)[0];
  return {
    strongSuit: strongest === undefined
      ? 'No comparative frame data.'
      : `${strongest.label}: ${strongest.display} — its strongest relative dimension here.`,
    tradeoff: tightest === undefined
      ? 'No comparative frame data.'
      : `${tightest.label}: ${tightest.display} — its tightest relative constraint here.`,
  };
}

function hardpointCapacity(chassis: Chassis, type: WeaponType): HardpointCapacity {
  const fittedLocations = LOCATIONS.filter((location) => chassis.hardpoints[location][type] > 0);
  return {
    type,
    count: fittedLocations.reduce(
      (total, location) => total + chassis.hardpoints[location][type],
      0,
    ),
    maximumSize: fittedLocations.length === 0
      ? null
      : Math.max(...fittedLocations.map((location) => chassis.hardpoints[location].size)),
  };
}

export function listLinewroughtFrames(catalog: Catalog): readonly LinewroughtFrameSummary[] {
  const frames = [...catalog.chassis.values()]
    .filter((chassis) => chassis.faction === 'linewrought' && chassis.frame === 'mech')
    .sort((a, b) => a.tonnage - b.tonnage || a.name.localeCompare(b.name))
    .map((chassis) => baseFrame(catalog, chassis));

  return frames.map((frame) => ({
    ...frame,
    tonnage: frame.chassis.tonnage,
    hardpoints: HARDPOINT_TYPES.map((type) => hardpointCapacity(frame.chassis, type)),
    traits: frame.chassis.traits.flatMap((id) => {
      const trait = catalog.rules.traits.entries[id];
      return trait === undefined ? [] : [{ id, label: trait.label, note: trait.note }];
    }),
    ...comparisonCopy(frames, frame),
  }));
}

export function linewroughtRecipes(catalog: Catalog, chassisId: string): readonly Design[] {
  const chassis = catalog.chassis.get(chassisId);
  if (chassis?.faction !== 'linewrought' || chassis.frame !== 'mech') return [];
  return [...catalog.designs.values()]
    .filter((design) => design.chassisId === chassisId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function defaultLinewroughtName(chassis: Chassis): string {
  return `${chassis.name} 'Shopwork'`.slice(0, 64);
}

function legalName(requested: string, chassis: Chassis): string {
  const compact = requested.trim().replace(/\s+/g, ' ');
  return (compact === '' ? defaultLinewroughtName(chassis) : compact).slice(0, 64);
}

function unusedDesignId(catalog: Catalog, name: string): string {
  const base = idFromName(name);
  if (!catalog.designs.has(base)) return base;
  const shopbuilt = `${base}_shopbuilt`;
  if (!catalog.designs.has(shopbuilt)) return shopbuilt;
  let serial = 2;
  while (catalog.designs.has(`${shopbuilt}_${serial}`)) serial += 1;
  return `${shopbuilt}_${serial}`;
}

export function createLinewroughtDraft(
  catalog: Catalog,
  request: LinewroughtDraftRequest,
): Design {
  const chassis = catalog.chassis.get(request.chassisId);
  if (chassis?.faction !== 'linewrought' || chassis.frame !== 'mech') {
    throw new Error(`"${request.chassisId}" is not a Linewrought mech frame`);
  }

  let draft: Design;
  if (request.mode === 'bare') {
    draft = blankDesign(catalog, chassis.id);
  } else {
    const recipe = catalog.designs.get(request.recipeId ?? '');
    if (recipe === undefined || recipe.chassisId !== chassis.id) {
      throw new Error(`unknown workshop recipe for "${chassis.id}"`);
    }
    draft = structuredClone(recipe);
  }

  const name = legalName(request.name, chassis);
  return {
    ...draft,
    id: unusedDesignId(catalog, name),
    name,
  };
}
