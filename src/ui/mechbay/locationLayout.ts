import type { Chassis, Hardpoints } from '../../schema/chassis';
import { LOCATIONS, type MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { weaponSizeLabel } from '../../sim/loadout';

const WEAPON_MOUNT_TYPES = ['energy', 'ballistic', 'missile'] as const;

export function locationWeaponMounts(hardpoints: Hardpoints): number {
  return WEAPON_MOUNT_TYPES.reduce((total, type) => total + hardpoints[type], 0);
}

export function locationHasOccupant(design: Design, location: MechLocation): boolean {
  return (
    design.mounts.some((mount) => mount.location === location)
    || design.ammo.some((bin) => bin.location === location)
    || design.equipment.some((fit) => fit.location === location)
  );
}

/**
 * What a location's mounts were built to take, in the words the shelf uses.
 * The size word comes from the construction rules so a retuned catalogue
 * never leaves the bay describing hardpoints that no longer exist.
 */
export function locationCapacityLine(catalog: Catalog, hardpoints: Hardpoints): string {
  if (locationWeaponMounts(hardpoints) === 0) return 'Gear and ammo only';
  const mounts = WEAPON_MOUNT_TYPES
    .filter((type) => hardpoints[type] > 0)
    .map((type) => `${hardpoints[type]} ${type}`);
  return `Takes ${mounts.join(' · ')}, up to ${weaponSizeLabel(catalog, hardpoints.size)}`;
}

export interface LocationLayout {
  /** Locations worth a full card: they can hold a gun, hold something, or are in play. */
  readonly full: readonly MechLocation[];
  /** Everything else folds into one strip until it is needed. */
  readonly compact: readonly MechLocation[];
}

/**
 * A leg with two gear slots does not need the same card as a torso with ten.
 * A location earns a full card by having a weapon mount, holding anything,
 * being selected, or being a place the held part could legally land; the
 * player can also ask for all of them at once.
 */
export function partitionLocations(
  chassis: Chassis,
  design: Design,
  options: {
    selected: MechLocation | null;
    targeting: boolean;
    compatible: ReadonlySet<MechLocation>;
    showAll: boolean;
  },
): LocationLayout {
  const full: MechLocation[] = [];
  const compact: MechLocation[] = [];
  for (const location of LOCATIONS) {
    const earnsCard =
      options.showAll
      || locationWeaponMounts(chassis.hardpoints[location]) > 0
      || locationHasOccupant(design, location)
      || options.selected === location
      || (options.targeting && options.compatible.has(location));
    (earnsCard ? full : compact).push(location);
  }
  return { full, compact };
}
