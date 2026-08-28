import type { Weapon } from '../schema/weapon';
import { lineOfSight } from './los';
import { distance } from './math';
import { currentSensorTrack, isSightedBy, visionFor } from './sensors';
import { weaponLongReach, weaponMaximumReach, weaponReach } from './weaponRange';
import {
  findAmmoBin,
  type MechEntity,
  type Vec2,
  type WeaponMount,
  type World,
} from './types';

export type WeaponGroupState = 'enabled' | 'intent';

export interface ContactFiringSolution {
  targetId: number;
  point: Vec2;
  source: 'optical' | 'sensor';
}

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

/** Whether this shot is using a current electronic return instead of optical sight. */
export function contactFiringSolution(
  world: World,
  shooter: MechEntity,
  target: MechEntity,
  weapon: Weapon,
  from: Vec2 = shooter.pos,
): ContactFiringSolution | null {
  const vision = visionFor(world, shooter.team);
  if (isSightedBy(vision, target)) {
    return weaponHasLineOfFire(world, from, target.pos, weapon)
      ? { targetId: target.id, point: { ...target.pos }, source: 'optical' }
      : null;
  }
  if (!isIndirectFireWeapon(weapon)) return null;
  const track = currentSensorTrack(vision, target);
  return track === null
    ? null
    : { targetId: target.id, point: { ...track.pos }, source: 'sensor' };
}

/** Whether this shot is using a current electronic return instead of optical sight. */
export function isIndirectSensorShot(
  world: World,
  shooter: MechEntity,
  target: MechEntity,
  weapon: Weapon,
): boolean {
  return contactFiringSolution(world, shooter, target, weapon)?.source === 'sensor';
}

/** Indirect mounts can turn a live electronic return into a penalised firing solution. */
export function weaponHasFiringSolution(
  world: World,
  shooter: MechEntity,
  target: MechEntity,
  weapon: Weapon,
  from: Vec2 = shooter.pos,
): boolean {
  return contactFiringSolution(world, shooter, target, weapon, from) !== null;
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
  target: Vec2,
  from: Vec2 = mech.pos,
): number {
  let reach = 0;
  for (const mount of mech.weapons) {
    const weapon = usableWeapon(world, mech, mount, state);
    if (weapon !== null) reach = Math.max(reach, weaponLongReach(world, weapon, from, target));
  }
  return reach;
}

export function longestUsableWeaponMaximumReach(
  world: World,
  mech: MechEntity,
  state: WeaponGroupState,
  target: Vec2,
  from: Vec2 = mech.pos,
): number {
  let reach = 0;
  for (const mount of mech.weapons) {
    const weapon = usableWeapon(world, mech, mount, state);
    if (weapon !== null) reach = Math.max(reach, weaponMaximumReach(world, weapon, from, target));
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
  return shooter.weapons.some((mount) => {
    const weapon = usableWeapon(world, shooter, mount, state);
    if (weapon === null) return false;
    const solution = contactFiringSolution(world, shooter, target, weapon, from);
    return solution !== null &&
      distance(from, solution.point) <=
        weaponReach(world, weapon, from, solution.point, rangeMultiplier);
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
    return weapon !== null && contactFiringSolution(world, shooter, target, weapon, from) !== null;
  });
}
