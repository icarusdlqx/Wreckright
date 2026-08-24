import type { Weapon } from '../schema/weapon';
import type { Vec2, World } from './types';

/** Authored downhill reach bonus from one firing point to one target. */
export function elevationRangeFactor(
  world: World,
  weapon: Weapon,
  from: Vec2,
  target: Vec2,
): number {
  const rules = world.rules.combat.elevation;
  const above = world.terrain.elevationAtPoint(from) - world.terrain.elevationAtPoint(target);
  if (above < rules.rangeMinimumLevels) return 1;
  // Indirect reach is set by the motor and firing solution, not by the direct horizon.
  if (weapon.tags.includes('indirect_fire')) return 1;
  const levels = Math.min(above, rules.maxLevels);
  return Math.min(rules.rangeMaxFactor, rules.rangePerLevel ** levels);
}

/** Absolute reach, including the ordinary beyond-long band and downhill extension. */
export function weaponMaximumReach(
  world: World,
  weapon: Weapon,
  from: Vec2,
  target: Vec2,
): number {
  return weaponReach(
    world,
    weapon,
    from,
    target,
    world.rules.combat.maxRangeMultiplier,
  );
}

/** Reach under a caller-authored envelope, retaining the same elevation rule. */
export function weaponReach(
  world: World,
  weapon: Weapon,
  from: Vec2,
  target: Vec2,
  rangeMultiplier: number,
): number {
  return weapon.range.long * rangeMultiplier * elevationRangeFactor(world, weapon, from, target);
}

/** End of the weapon's long bracket, extended only when firing downhill. */
export function weaponLongReach(
  world: World,
  weapon: Weapon,
  from: Vec2,
  target: Vec2,
): number {
  return weapon.range.long * elevationRangeFactor(world, weapon, from, target);
}
