import type { Weapon } from '../schema/weapon';
import { lineOfSight } from './los';
import { distance } from './math';
import { isSightedBy, visionFor } from './sensors';
import {
  findAmmoBin,
  type MechEntity,
  type Vec2,
  type WeaponMount,
  type World,
} from './types';

export type WeaponGroupState = 'enabled' | 'intent';

/** Authored capability: this weapon can turn a teammate's optical sight into a shot. */
export function isIndirectFireWeapon(weapon: Weapon): boolean {
  return weapon.tags.includes('indirect_fire');
}

/**
 * Geometry needed by this weapon. Direct fire needs its own clear ray; an
 * indirect mount can arc from cover once somebody on the team has eyes on.
 */
export function weaponHasLineOfFire(
  world: World,
  from: Vec2,
  target: Vec2,
  weapon: Weapon,
): boolean {
  return isIndirectFireWeapon(weapon) || lineOfSight(world.terrain, from, target).clear;
}

/** A mount may use shared optical sight, but never an electronic-only contact. */
export function weaponHasFiringSolution(
  world: World,
  shooter: MechEntity,
  target: MechEntity,
  weapon: Weapon,
  from: Vec2 = shooter.pos,
): boolean {
  return (
    isSightedBy(visionFor(world, shooter.team), target) &&
    weaponHasLineOfFire(world, from, target.pos, weapon)
  );
}

/** Resolves a working, supplied mount the pilot currently permits. */
export function usableWeapon(
  world: World,
  mech: MechEntity,
  mount: WeaponMount,
  state: WeaponGroupState,
): Weapon | null {
  const groups = state === 'enabled' ? mech.groupEnabled : mech.groupIntent;
  if (mount.destroyed || groups[mount.group - 1] !== true) return null;
  const weapon = world.catalog.weapons.get(mount.weaponId);
  if (weapon === undefined) return null;
  if (weapon.ammoPerTon !== null && findAmmoBin(mech, weapon.id) === null) return null;
  return weapon;
}

export function longestUsableWeaponReach(
  world: World,
  mech: MechEntity,
  state: WeaponGroupState,
): number {
  let reach = 0;
  for (const mount of mech.weapons) {
    const weapon = usableWeapon(world, mech, mount, state);
    if (weapon !== null) reach = Math.max(reach, weapon.range.long);
  }
  return reach;
}

/** At least one permitted mount can damage this optically sighted target now. */
export function hasUsableFiringSolution(
  world: World,
  shooter: MechEntity,
  target: MechEntity,
  state: WeaponGroupState,
  from: Vec2 = shooter.pos,
  rangeMultiplier: number = world.rules.combat.maxRangeMultiplier,
): boolean {
  const range = distance(from, target.pos);
  return shooter.weapons.some((mount) => {
    const weapon = usableWeapon(world, shooter, mount, state);
    return (
      weapon !== null &&
      range <= weapon.range.long * rangeMultiplier &&
      weaponHasFiringSolution(world, shooter, target, weapon, from)
    );
  });
}

/** At least one permitted mount has the geometry to engage, regardless of range. */
export function hasUsableLineOfFire(
  world: World,
  shooter: MechEntity,
  target: MechEntity,
  state: WeaponGroupState,
  from: Vec2 = shooter.pos,
): boolean {
  return shooter.weapons.some((mount) => {
    const weapon = usableWeapon(world, shooter, mount, state);
    return weapon !== null && weaponHasFiringSolution(world, shooter, target, weapon, from);
  });
}
