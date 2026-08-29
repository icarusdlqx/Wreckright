import { LOCATIONS, type MechLocation } from '../../schema/common';
import type { Chassis } from '../../schema/chassis';
import { TORSO_LOCATIONS, type Design, type TorsoLocation } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import {
  activeArmourLocations,
  armourFacesForDesign,
  rearArmourForPreset,
  withArmourTotals,
} from '../../sim/designArmour';
import { computeLoadout } from '../../sim/loadout';

export type ChassisClass = Chassis['class'];
export type StockArmourMedians = Readonly<Record<MechLocation, number | null>>;

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) return null;
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[middle - 1];
  return lower === undefined ? null : (lower + upper) / 2;
}

export function stockArmourMediansForClass(
  catalog: Catalog,
  chassisClass: ChassisClass,
): StockArmourMedians {
  const pointsByLocation = Object.fromEntries(
    LOCATIONS.map((location) => [location, [] as number[]]),
  ) as Record<MechLocation, number[]>;

  for (const design of catalog.designs.values()) {
    const chassis = catalog.chassis.get(design.chassisId);
    if (chassis === undefined || chassis.class !== chassisClass) continue;
    for (const location of activeArmourLocations(catalog.rules, chassis.frame)) {
      pointsByLocation[location].push(design.armour[location]);
    }
  }

  return Object.fromEntries(
    LOCATIONS.map((location) => [location, median(pointsByLocation[location])]),
  ) as Record<MechLocation, number | null>;
}

export function isArmourUnderMedian(points: number, medianPoints: number | null): boolean {
  return medianPoints !== null && points < medianPoints;
}

export function designArmourLocations(
  catalog: Catalog,
  design: Design,
): readonly MechLocation[] {
  const chassis = catalog.chassis.get(design.chassisId);
  return chassis === undefined ? [] : activeArmourLocations(catalog.rules, chassis.frame);
}

function preserveSelectedPreset(catalog: Catalog, before: Design, after: Design): Design {
  const selected = selectedRearArmourPreset(catalog, before);
  return selected === null ? after : applyRearArmourPreset(catalog, after, selected);
}

/** Spreads an exact paid total over reachable locations without losing a point to rounding. */
export function setPaidArmourTotal(
  catalog: Catalog,
  design: Design,
  requestedPoints: number,
): Design {
  const chassis = catalog.chassis.get(design.chassisId);
  if (chassis === undefined) return design;
  const active = designArmourLocations(catalog, design);
  const maximum = active.reduce((sum, location) => sum + chassis.armourMax[location], 0);
  const finite = Number.isFinite(requestedPoints) ? Math.round(requestedPoints) : 0;
  const target = Math.max(0, Math.min(maximum, finite));
  const armour = Object.fromEntries(LOCATIONS.map((location) => [location, 0])) as Design['armour'];
  if (maximum === 0) {
    return preserveSelectedPreset(catalog, design, withArmourTotals(design, armour));
  }

  const shares = active.map((location, index) => {
    const exact = (chassis.armourMax[location] * target) / maximum;
    const points = Math.floor(exact);
    armour[location] = points;
    return { location, index, remainder: exact - points };
  });
  let left = target - active.reduce((sum, location) => sum + armour[location], 0);
  shares.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const share of shares) {
    if (left === 0) break;
    armour[share.location] += 1;
    left -= 1;
  }
  return preserveSelectedPreset(catalog, design, withArmourTotals(design, armour));
}

export function setLocationPaidArmour(
  catalog: Catalog,
  design: Design,
  location: MechLocation,
  requestedPoints: number,
): Design {
  const chassis = catalog.chassis.get(design.chassisId);
  if (chassis === undefined || !designArmourLocations(catalog, design).includes(location)) {
    return design;
  }
  const finite = Number.isFinite(requestedPoints) ? Math.round(requestedPoints) : 0;
  const points = Math.max(0, Math.min(chassis.armourMax[location], finite));
  return preserveSelectedPreset(
    catalog,
    design,
    withArmourTotals(design, { ...design.armour, [location]: points }),
  );
}

export function setTorsoRearArmour(
  catalog: Catalog,
  design: Design,
  location: TorsoLocation,
  requestedPoints: number,
): Design {
  const rearCapable = catalog.rules.construction.rearArmour.locations.includes(location);
  if (!rearCapable || !designArmourLocations(catalog, design).includes(location)) return design;
  const finite = Number.isFinite(requestedPoints) ? Math.round(requestedPoints) : 0;
  const rearArmour = Object.fromEntries(TORSO_LOCATIONS.map((torso) => [
    torso,
    armourFacesForDesign(catalog.rules.construction, design, torso).rear,
  ])) as NonNullable<Design['rearArmour']>;
  rearArmour[location] = Math.max(0, Math.min(design.armour[location], finite));
  return { ...design, rearArmour };
}

export function applyRearArmourPreset(
  catalog: Catalog,
  design: Design,
  presetId: string,
): Design {
  const rearArmour = rearArmourForPreset(catalog.rules.construction, design, presetId);
  return rearArmour === null || rearArmour === undefined ? design : { ...design, rearArmour };
}

export function selectedRearArmourPreset(catalog: Catalog, design: Design): string | null {
  const matches = catalog.rules.construction.rearArmour.presets.filter((preset) => {
    const candidate = rearArmourForPreset(catalog.rules.construction, design, preset.id);
    return candidate !== null && candidate !== undefined && TORSO_LOCATIONS.every((location) =>
      candidate[location] === armourFacesForDesign(
        catalog.rules.construction,
        design,
        location,
      ).rear);
  });
  return matches.length === 1 ? matches[0]?.id ?? null : null;
}

export function spendRemainingTonnage(catalog: Catalog, design: Design): Design {
  const chassis = catalog.chassis.get(design.chassisId);
  if (chassis === undefined) return design;
  const loadout = computeLoadout(catalog, design);
  const nonArmourWeight = loadout.usedWeight - loadout.armourWeight;
  const affordablePoints = Math.floor(
    Math.max(0, chassis.tonnage - nonArmourWeight)
      * catalog.rules.construction.armourPointsPerTon,
  );
  return setPaidArmourTotal(catalog, design, affordablePoints);
}

/** Reapplies a user's explicit posture intent after a rounded-zero resize. */
export function applyRememberedArmourPosture(
  catalog: Catalog,
  design: Design,
  presetId: string | null,
): Design {
  return presetId === null ? design : applyRearArmourPreset(catalog, design, presetId);
}
