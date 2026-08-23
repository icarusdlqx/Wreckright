import type { Chassis } from '../schema/chassis';
import { LOCATIONS, type MechLocation } from '../schema/common';
import type { Design } from '../schema/design';
import type { Catalog } from '../schema/load';
import type { Weapon, WeaponType } from '../schema/weapon';
import { activeArmourLocations, withArmourTotals } from './designArmour';
export { splitArmour } from './designArmour';
export { computeHeatProfile, type HeatProfile } from './loadoutHeat';

export interface LocationUsage {
  slotsUsed: number;
  slotsAvailable: number;
  hardpointsUsed: Record<WeaponType, number>;
  hardpointsAvailable: Record<WeaponType, number>;
  /** The largest weapon size this location's mounts are built for. */
  size: number;
}

export interface LoadoutIssue {
  code:
    | 'unknown_chassis'
    | 'unknown_weapon'
    | 'unknown_equipment'
    | 'unknown_heat_sink'
    | 'overweight'
    | 'hardpoint'
    | 'hardpoint_size'
    | 'slots'
    | 'armour'
    | 'heat_sinks'
    | 'dry_weapon'
    | 'orphan_ammo'
    | 'energy_ammo'
    | 'jump_jets';
  location: MechLocation | null;
  reference?: 'ammo';
  message: string;
}

export interface Loadout {
  chassisId: string;
  tonnage: number;
  engineWeight: number;
  structureWeight: number;
  armourWeight: number;
  armourPoints: number;
  heatSinkWeight: number;
  extraHeatSinks: number;
  payloadWeight: number;
  usedWeight: number;
  freeTonnage: number;
  totalSlotsUsed: number;
  totalSlotsAvailable: number;
  perLocation: Record<MechLocation, LocationUsage>;
  issues: LoadoutIssue[];
  valid: boolean;
}

const WEAPON_TYPES: readonly WeaponType[] = ['energy', 'ballistic', 'missile'];

function emptyUsage(chassis: Chassis, location: MechLocation, active: boolean): LocationUsage {
  const hardpoints = chassis.hardpoints[location];
  return {
    slotsUsed: 0,
    slotsAvailable: active ? hardpoints.slots : 0,
    hardpointsUsed: { energy: 0, ballistic: 0, missile: 0 },
    hardpointsAvailable: {
      energy: active ? hardpoints.energy : 0,
      ballistic: active ? hardpoints.ballistic : 0,
      missile: active ? hardpoints.missile : 0,
    },
    size: active ? hardpoints.size : 0,
  };
}

/**
 * How large a hardpoint a weapon needs. Authored on the weapon when it is
 * bulkier or more compact than its weight suggests; read off its tonnage
 * otherwise, so a new gun gets a sensible size without anyone remembering to
 * set one.
 */
export function weaponSize(catalog: Catalog, weapon: Weapon): number {
  if (weapon.size !== null) return weapon.size;
  const [light, medium, heavy] = catalog.rules.construction.weaponSizeTonnage;
  if (weapon.tonnage <= light) return 1;
  if (weapon.tonnage <= medium) return 2;
  return weapon.tonnage <= heavy ? 3 : 4;
}

export function weaponSizeLabel(catalog: Catalog, size: number): string {
  return catalog.rules.construction.weaponSizeLabels[size - 1] ?? String(size);
}

const roundHalf = (value: number): number => Math.round(value * 2) / 2;

export function engineWeightFor(catalog: Catalog, engineRating: number): number | null {
  return catalog.rules.construction.engineWeightByRating[String(engineRating)] ?? null;
}

export function computeLoadout(catalog: Catalog, design: Design): Loadout {
  const issues: LoadoutIssue[] = [];
  const chassis = catalog.chassis.get(design.chassisId);

  if (chassis === undefined) {
    return {
      chassisId: design.chassisId,
      tonnage: 0,
      engineWeight: 0,
      structureWeight: 0,
      armourWeight: 0,
      armourPoints: 0,
      heatSinkWeight: 0,
      extraHeatSinks: 0,
      payloadWeight: 0,
      usedWeight: 0,
      freeTonnage: 0,
      totalSlotsUsed: 0,
      totalSlotsAvailable: 0,
      perLocation: Object.fromEntries(
        LOCATIONS.map((location) => [
          location,
          {
            slotsUsed: 0,
            slotsAvailable: 0,
            hardpointsUsed: { energy: 0, ballistic: 0, missile: 0 },
            hardpointsAvailable: { energy: 0, ballistic: 0, missile: 0 },
            size: 0,
          },
        ]),
      ) as Record<MechLocation, LocationUsage>,
      issues: [
        {
          code: 'unknown_chassis',
          location: null,
          message: `unknown chassis "${design.chassisId}"`,
        },
      ],
      valid: false,
    };
  }

  const construction = catalog.rules.construction;
  const activeArmour = new Set(activeArmourLocations(catalog.rules, chassis.frame));
  const perLocation = Object.fromEntries(
    LOCATIONS.map((location) => [location, emptyUsage(chassis, location, activeArmour.has(location))]),
  ) as Record<MechLocation, LocationUsage>;

  const engineWeight = engineWeightFor(catalog, chassis.engineRating);
  if (engineWeight === null) {
    issues.push({
      code: 'overweight',
      location: null,
      message: `no engine weight listed for rating ${chassis.engineRating}`,
    });
  }

  const structureWeight = roundHalf(chassis.tonnage * construction.structureWeightFraction);

  let armourPoints = 0;
  for (const location of LOCATIONS) {
    const allocated = design.armour[location];
    if (!activeArmour.has(location)) {
      if (allocated > 0) {
        issues.push({
          code: 'armour',
          location,
          message: `${chassis.name} has no ${location.replaceAll('_', ' ')} armour location`,
        });
      }
      continue;
    }
    armourPoints += allocated;
    if (allocated > chassis.armourMax[location]) {
      issues.push({
        code: 'armour',
        location,
        message: `${allocated} armour exceeds the ${chassis.armourMax[location]} maximum`,
      });
    }
  }
  const armourWeight = roundHalf(armourPoints / construction.armourPointsPerTon);

  const sink = catalog.equipment.get(design.heatSinkId);
  if (sink === undefined || sink.category !== 'heat_sink') {
    issues.push({
      code: 'unknown_heat_sink',
      location: null,
      message: `"${design.heatSinkId}" is not a heat sink`,
    });
  }
  if (design.heatSinks < chassis.internalHeatSinks) {
    issues.push({
      code: 'heat_sinks',
      location: null,
      message: `chassis carries ${chassis.internalHeatSinks} internal heat sinks; a design cannot fit fewer`,
    });
  }

  const extraHeatSinks = Math.max(0, design.heatSinks - chassis.internalHeatSinks);
  const heatSinkWeight = extraHeatSinks * (sink?.tonnage ?? 0);

  let payloadWeight = 0;

  for (const mount of design.mounts) {
    const weapon = catalog.weapons.get(mount.weaponId);
    if (weapon === undefined) {
      issues.push({
        code: 'unknown_weapon',
        location: mount.location,
        message: `unknown weapon "${mount.weaponId}"`,
      });
      continue;
    }
    payloadWeight += weapon.tonnage;
    const usage = perLocation[mount.location];
    usage.slotsUsed += weapon.slots;
    usage.hardpointsUsed[weapon.type] += 1;

    const size = weaponSize(catalog, weapon);
    if (size > usage.size) {
      issues.push({
        code: 'hardpoint_size',
        location: mount.location,
        message: `${weapon.name} needs a size-${size} (${weaponSizeLabel(catalog, size)}) mount; this location is size ${usage.size} (${weaponSizeLabel(catalog, usage.size)})`,
      });
    }
  }

  const mountedWeapons = new Set(design.mounts.map((mount) => mount.weaponId));
  const liveAmmoWeapons = new Set<string>();
  for (const load of design.ammo) {
    const weapon = catalog.weapons.get(load.weaponId);
    if (weapon === undefined) {
      issues.push({
        code: 'unknown_weapon',
        location: load.location,
        reference: 'ammo',
        message: `unknown weapon "${load.weaponId}"`,
      });
      continue;
    }
    if (weapon.ammoPerTon === null) {
      issues.push({
        code: 'energy_ammo',
        location: load.location,
        message: `${weapon.name} uses no ammo`,
      });
    } else if (load.tons > 0) {
      liveAmmoWeapons.add(load.weaponId);
    }
    if (!mountedWeapons.has(load.weaponId)) {
      issues.push({
        code: 'orphan_ammo',
        location: load.location,
        message: `${weapon.name} ammo carried but the weapon is not mounted`,
      });
    }
    payloadWeight += load.tons;
    perLocation[load.location].slotsUsed += load.tons * construction.ammoSlotsPerTon;
  }

  for (const mount of design.mounts) {
    const weapon = catalog.weapons.get(mount.weaponId);
    if (weapon === undefined || weapon.ammoPerTon === null) continue;
    if (liveAmmoWeapons.has(mount.weaponId)) continue;
    issues.push({
      code: 'dry_weapon',
      location: mount.location,
      message: `${weapon.name} is mounted with no live ammo bin`,
    });
  }

  for (const fit of design.equipment) {
    const equipment = catalog.equipment.get(fit.equipmentId);
    if (equipment === undefined) {
      issues.push({
        code: 'unknown_equipment',
        location: fit.location,
        message: `unknown equipment "${fit.equipmentId}"`,
      });
      continue;
    }
    payloadWeight += equipment.tonnage;
    perLocation[fit.location].slotsUsed += equipment.slots;

    // Jets need the gyro and the reinforced actuators that come with a
    // jump-capable chassis. Bolted to anything else they are dead weight, and
    // the build should say so rather than quietly charging a tonne for nothing.
    if (equipment.category === 'jump_jet' && !chassis.jumpCapable) {
      issues.push({
        code: 'jump_jets',
        location: fit.location,
        message: `the ${chassis.name} cannot mount jump jets`,
      });
    }
  }

  for (const location of LOCATIONS) {
    const usage = perLocation[location];
    if (usage.slotsUsed > usage.slotsAvailable) {
      issues.push({
        code: 'slots',
        location,
        message: `${usage.slotsUsed} slots used of ${usage.slotsAvailable} available`,
      });
    }
    for (const type of WEAPON_TYPES) {
      if (usage.hardpointsUsed[type] > usage.hardpointsAvailable[type]) {
        issues.push({
          code: 'hardpoint',
          location,
          message: `${usage.hardpointsUsed[type]} ${type} weapons need ${usage.hardpointsUsed[type]} hardpoints, chassis has ${usage.hardpointsAvailable[type]}`,
        });
      }
    }
  }

  const totalSlotsAvailable = LOCATIONS.reduce(
    (sum, location) => sum + perLocation[location].slotsAvailable,
    0,
  );
  const locatedSlots = LOCATIONS.reduce(
    (sum, location) => sum + perLocation[location].slotsUsed,
    0,
  );
  // Heat sinks are not placed by hand yet, so they are checked against the whole chassis.
  const totalSlotsUsed = locatedSlots + extraHeatSinks * (sink?.slots ?? 0);

  if (totalSlotsUsed > totalSlotsAvailable) {
    issues.push({
      code: 'slots',
      location: null,
      message: `${totalSlotsUsed} slots used of ${totalSlotsAvailable} on the whole chassis`,
    });
  }

  const usedWeight =
    (engineWeight ?? 0) + structureWeight + armourWeight + heatSinkWeight + payloadWeight;
  const freeTonnage = roundHalf(chassis.tonnage - usedWeight);

  if (freeTonnage < 0) {
    issues.push({
      code: 'overweight',
      location: null,
      message: `${Math.abs(freeTonnage).toFixed(1)}t over the ${chassis.tonnage}t limit`,
    });
  }

  return {
    chassisId: chassis.id,
    tonnage: chassis.tonnage,
    engineWeight: engineWeight ?? 0,
    structureWeight,
    armourWeight,
    armourPoints,
    heatSinkWeight,
    extraHeatSinks,
    payloadWeight,
    usedWeight,
    freeTonnage,
    totalSlotsUsed,
    totalSlotsAvailable,
    perLocation,
    issues,
    valid: issues.length === 0,
  };
}

/** Spends every remaining ton on armour, in proportion to each location's maximum. */
export function maximiseArmour(catalog: Catalog, design: Design): Design {
  const chassis = catalog.chassis.get(design.chassisId);
  if (chassis === undefined) return design;
  const activeArmour = new Set(activeArmourLocations(catalog.rules, chassis.frame));

  const stripped: Design = {
    ...design,
    armour: Object.fromEntries(LOCATIONS.map((location) => [location, 0])) as Record<
      MechLocation,
      number
    >,
  };

  const bare = computeLoadout(catalog, stripped);
  const affordable = Math.max(0, bare.freeTonnage) * catalog.rules.construction.armourPointsPerTon;
  const maxTotal = LOCATIONS.reduce(
    (sum, location) => sum + (activeArmour.has(location) ? chassis.armourMax[location] : 0),
    0,
  );
  const scale = maxTotal === 0 ? 0 : Math.min(1, affordable / maxTotal);

  return withArmourTotals(
    design,
    Object.fromEntries(
      LOCATIONS.map((location) => [
        location,
        activeArmour.has(location) ? Math.floor(chassis.armourMax[location] * scale) : 0,
      ]),
    ) as Record<MechLocation, number>,
  );
}
