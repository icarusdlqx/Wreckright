import { LOCATIONS, type MechLocation } from '../schema/common';
import {
  TORSO_LOCATIONS,
  type Design,
  type TorsoLocation,
} from '../schema/design';
import type { ConstructionRules, Frame, Rules } from '../schema/rules';
import { buildFrameArcTables } from './arcs';

export interface ArmourFaces {
  readonly front: number;
  readonly rear: number;
}

function boundedRear(total: number, rear: number): number {
  return Math.max(0, Math.min(total, rear));
}

/** Locations that at least one authored attack arc can actually reach. */
export function activeArmourLocations(rules: Rules, frame: Frame): readonly MechLocation[] {
  const tables = buildFrameArcTables(rules)[frame].tables;
  const active = new Set(
    Object.values(tables).flatMap((table) => table.map((entry) => entry.value)),
  );
  return LOCATIONS.filter((location) => active.has(location));
}

/** The legacy rule split remains the public fallback for older consumers. */
export function splitArmour(
  rules: ConstructionRules,
  location: MechLocation,
  total: number,
): ArmourFaces {
  if (!rules.rearArmour.locations.includes(location as TorsoLocation)) {
    return { front: total, rear: 0 };
  }
  const rear = boundedRear(total, Math.round(total * rules.rearArmour.fraction));
  return { front: total - rear, rear };
}

/** Resolves an exact design allocation without changing its paid armour total. */
export function armourFacesForDesign(
  rules: ConstructionRules,
  design: Design,
  location: MechLocation,
): ArmourFaces {
  const total = design.armour[location];
  if (!rules.rearArmour.locations.includes(location as TorsoLocation)) {
    return { front: total, rear: 0 };
  }
  const explicit = design.rearArmour?.[location as TorsoLocation];
  if (explicit === undefined || !TORSO_LOCATIONS.includes(location as TorsoLocation)) {
    return splitArmour(rules, location, total);
  }
  const rear = boundedRear(total, explicit);
  return { front: total - rear, rear };
}

/** Turns an authored preset into the exact integer points a design persists. */
export function rearArmourForPreset(
  rules: ConstructionRules,
  design: Design,
  presetId: string,
): Design['rearArmour'] | null {
  const preset = rules.rearArmour.presets.find((entry) => entry.id === presetId);
  if (preset === undefined) return null;
  return Object.fromEntries(TORSO_LOCATIONS.map((location) => [
    location,
    rules.rearArmour.locations.includes(location)
      ? boundedRear(design.armour[location], Math.round(design.armour[location] * preset.fraction))
      : 0,
  ])) as NonNullable<Design['rearArmour']>;
}

/** Replaces paid totals while keeping an explicit rear allocation legal. */
export function withArmourTotals(
  design: Design,
  armour: Design['armour'],
): Design {
  if (design.rearArmour === undefined) return { ...design, armour };
  return {
    ...design,
    armour,
    rearArmour: Object.fromEntries(TORSO_LOCATIONS.map((location) => [
      location,
      boundedRear(armour[location], design.rearArmour?.[location] ?? 0),
    ])) as NonNullable<Design['rearArmour']>,
  };
}

/**
 * Carries missing plate through a refit. Face-specific damage stays on its
 * face where it fits, then any overflow moves to the other face; increasing
 * the paid total remains uninstalled until a repair is bought.
 */
export function carryArmourDamage(
  current: ArmourFaces,
  previousMax: ArmourFaces,
  nextMax: ArmourFaces,
): ArmourFaces {
  const previousDamage =
    Math.max(0, previousMax.front - current.front) +
    Math.max(0, previousMax.rear - current.rear);
  const previousTotal = previousMax.front + previousMax.rear;
  const nextTotal = nextMax.front + nextMax.rear;
  const targetDamage = Math.min(
    nextTotal,
    previousDamage + Math.max(0, nextTotal - previousTotal),
  );

  const oldFrontDamage = Math.max(0, previousMax.front - current.front);
  const oldRearDamage = Math.max(0, previousMax.rear - current.rear);
  let frontDamage = Math.min(nextMax.front, oldFrontDamage);
  let rearDamage = Math.min(nextMax.rear, oldRearDamage);
  let remaining = Math.max(0, targetDamage - frontDamage - rearDamage);
  const addFrontDamage = (wanted: number): void => {
    const added = Math.min(remaining, wanted, nextMax.front - frontDamage);
    frontDamage += added;
    remaining -= added;
  };
  const addRearDamage = (wanted: number): void => {
    const added = Math.min(remaining, wanted, nextMax.rear - rearDamage);
    rearDamage += added;
    remaining -= added;
  };

  // Damage displaced by a shrinking face follows the plate to the other face.
  addRearDamage(Math.max(0, oldFrontDamage - frontDamage));
  addFrontDamage(Math.max(0, oldRearDamage - rearDamage));

  // Added maxima are not free repairs: their new points start missing on the
  // face that grew. Any remainder only covers malformed inherited condition.
  addFrontDamage(Math.max(0, nextMax.front - previousMax.front));
  addRearDamage(Math.max(0, nextMax.rear - previousMax.rear));
  addFrontDamage(remaining);
  addRearDamage(remaining);

  return {
    front: nextMax.front - frontDamage,
    rear: nextMax.rear - rearDamage,
  };
}
