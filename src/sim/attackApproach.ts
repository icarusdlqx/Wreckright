import { roleOf } from './ai/roles';
import { expectedDps } from './ai/utility';
import { hitChance } from './combat';
import { bodyRadius } from './collision';
import { distance } from './math';
import { findPath } from './pathfind';
import { isSightedBy, visionFor } from './sensors';
import { isImmobile, isOperational, type MechEntity, type Vec2, type World } from './types';
import { hasUsableFiringSolution, usableWeapon } from './weaponEngagement';
import { weaponFireProfile } from './weaponModes';
import { weaponLongReach, weaponMaximumReach } from './weaponRange';

export interface AttackApproach {
  /** The loadout's intended engagement distance, not a promise of every gun firing. */
  range: number;
  /** Reachable stop point on the approach, or the current position when blocked. */
  point: Vec2;
  needsMove: boolean;
  reachable: boolean;
}

/** Prices only permitted, supplied guns; neither a preview nor a range choice consumes RNG. */
export function intendedEngagementRange(
  world: World,
  shooter: MechEntity,
  target: MechEntity,
): number | null {
  if (!isOperational(shooter) || !isOperational(target) || shooter.team === target.team ||
    !isSightedBy(visionFor(world, shooter.team), target)) return null;
  const battery = shooter.weapons.flatMap((mount) => {
    const weapon = usableWeapon(world, shooter, mount, 'intent');
    return weapon === null ? [] : [{ weapon, profile: weaponFireProfile(weapon, mount.modeId) }];
  });
  if (battery.length === 0) return null;

  const rules = world.rules.ai.playerApproach;
  const longest = Math.max(...battery.map(({ weapon }) =>
    weaponLongReach(world, weapon, shooter.pos, target.pos)));
  const samples = new Set([longest]);
  for (let range = rules.rangeSampleStep; range < longest; range += rules.rangeSampleStep) {
    samples.add(range);
  }
  const caution = roleOf(world, shooter).caution * rules.incomingDamageWeight;
  let chosen: number | null = null;
  let best = -Infinity;
  for (const range of [...samples].sort((a, b) => a - b)) {
    const output = battery.reduce((sum, { weapon, profile }) => {
      if (range > weaponMaximumReach(world, weapon, shooter.pos, target.pos)) return sum;
      const chance = hitChance(world, shooter, target, weapon, range, undefined,
        shooter.pos, target.pos, profile);
      return sum + profile.damage * profile.projectiles * chance / profile.cooldown;
    }, 0);
    if (output <= 0) continue;
    const score = output - expectedDps(world, target, shooter, range) * caution;
    // Ties keep the longer band instead of closing for no improvement.
    if (score >= best) { chosen = range; best = score; }
  }
  return chosen === null ? null : Math.max(chosen,
    bodyRadius(world, shooter) + bodyRadius(world, target) + world.rules.movement.arrivalRadius);
}

export function atAttackRange(
  world: World, shooter: MechEntity, target: MechEntity, range: number, from = shooter.pos,
): boolean {
  return distance(from, target.pos) <= range + world.rules.ai.playerApproach.rangeTolerance &&
    hasUsableFiringSolution(world, shooter, target, 'intent', from);
}

export interface AttackApproachRoute extends AttackApproach { path: Vec2[] }

/** Samples the actual route segments: an open-ground A* route may contain only its endpoint. */
export function attackApproachRoute(
  world: World, shooter: MechEntity, target: MechEntity,
  range = intendedEngagementRange(world, shooter, target),
): AttackApproachRoute | null {
  if (range === null) return null;
  if (atAttackRange(world, shooter, target, range)) {
    return { range, point: { ...shooter.pos }, needsMove: false, reachable: true, path: [] };
  }
  const path = isImmobile(shooter) ? null :
    findPath(world.terrain, shooter.pos, target.pos, world.rules.simulation.pathfindMaxNodes);
  let from = shooter.pos;
  const traversed: Vec2[] = [];
  for (const to of path ?? []) {
    const count = Math.max(1, Math.ceil(distance(from, to) / world.terrain.tileSize));
    for (let index = 1; index <= count; index += 1) {
      const t = index / count;
      const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      if (atAttackRange(world, shooter, target, range, point)) {
        return { range, point, needsMove: true, reachable: true, path: [...traversed, point] };
      }
    }
    traversed.push(to);
    from = to;
  }
  return { range, point: { ...shooter.pos }, needsMove: true, reachable: false, path: [] };
}

/** One path solve; safe to memoize by world tick and optically identified target. */
export function intendedAttackApproach(
  world: World, shooter: MechEntity, target: MechEntity,
): AttackApproach | null {
  const plan = attackApproachRoute(world, shooter, target);
  return plan === null ? null : {
    range: plan.range, point: plan.point, needsMove: plan.needsMove, reachable: plan.reachable,
  };
}
