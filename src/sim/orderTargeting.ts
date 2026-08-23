import { lineOfSight } from './los';
import { distance } from './math';
import { replacePath } from './pathProgress';
import { findPath } from './pathfind';
import { isVisibleTo, visionFor } from './sensors';
import {
  findEntity,
  isOperational,
  type MechEntity,
  type Vec2,
  type World,
} from './types';

export interface OrderedContact {
  target: MechEntity | null;
  visible: boolean;
  lastKnown: Vec2 | null;
}

/** Separates the player's standing order from the live contact it may have lost. */
export function orderedContact(world: World, entity: MechEntity): OrderedContact {
  const id = entity.orders.attack?.targetId ?? null;
  const target = findEntity(world, id);
  const vision = visionFor(world, entity.team);
  return {
    target,
    visible: target !== null && isOperational(target) && isVisibleTo(vision, target),
    lastKnown: id === null ? null : (vision?.ghosts.get(id)?.pos ?? null),
  };
}

export function autoAcquire(world: World, entity: MechEntity): MechEntity | null {
  let best: MechEntity | null = null;
  let bestRange = Number.POSITIVE_INFINITY;
  const vision = visionFor(world, entity.team);

  for (const candidate of world.entities) {
    if (candidate.team === entity.team || !isOperational(candidate)) continue;
    if (!isVisibleTo(vision, candidate)) continue;

    const range = distance(entity.pos, candidate.pos);
    if (range < bestRange) {
      best = candidate;
      bestRange = range;
    }
  }

  return best;
}

/** The longest reach of any working gun aboard, in metres. */
function longestReach(world: World, entity: MechEntity): number {
  return entity.weapons.reduce((longest, mount) => {
    if (mount.destroyed) return longest;
    const weapon = world.catalog.weapons.get(mount.weaponId);
    return weapon === undefined ? longest : Math.max(longest, weapon.range.long);
  }, 0);
}

/**
 * Walks an attack-ordered mech into the fight: toward its quarry until it is
 * inside most of its longest gun's reach with a line of sight, then stops to
 * shoot from there rather than marching on to point blank. Returns true while
 * the approach is still walking; false hands the feet back to whoever called.
 */
export function approachToEngage(
  world: World,
  entity: MechEntity,
  quarry: MechEntity,
): boolean {
  const reach = longestReach(world, entity);
  // Nothing to shoot with: charging a machine you cannot hurt is not an
  // approach, it is a donation.
  if (reach <= 0) return false;

  const gap = distance(entity.pos, quarry.pos);
  const sighted = lineOfSight(world.terrain, entity.pos, quarry.pos).clear;
  if (gap <= reach * 0.85 && sighted) return false;

  if (entity.path.length === 0 || world.tick >= entity.nextPathTick) {
    const path = findPath(
      world.terrain,
      entity.pos,
      quarry.pos,
      world.rules.simulation.pathfindMaxNodes,
    );
    entity.nextPathTick = world.tick + world.rules.simulation.aiPathIntervalTicks;
    replacePath(entity, path ?? []);
  }
  if (entity.path.length === 0) return false;

  entity.motion = 'walk';
  entity.intendedMotion = 'walk';
  return true;
}

/** Searches the final sensor return without learning where the contact went next. */
export function approachToLastKnown(
  world: World,
  entity: MechEntity,
  lastKnown: Vec2,
): boolean {
  if (distance(entity.pos, lastKnown) <= world.rules.movement.arrivalRadius) return false;

  const currentEnd = entity.path.at(-1);
  const routeChanged =
    currentEnd === undefined ||
    distance(currentEnd, lastKnown) > world.rules.movement.arrivalRadius;
  if (routeChanged || world.tick >= entity.nextPathTick) {
    const path = findPath(
      world.terrain,
      entity.pos,
      lastKnown,
      world.rules.simulation.pathfindMaxNodes,
    );
    entity.nextPathTick = world.tick + world.rules.simulation.aiPathIntervalTicks;
    replacePath(
      entity,
      path === null ? [] : path.length === 0 ? [{ ...lastKnown }] : path,
    );
  }
  if (entity.path.length === 0) return false;

  entity.motion = 'walk';
  entity.intendedMotion = 'walk';
  return true;
}

/** Applies a firing solution without consuming or exposing a hidden standing order. */
export function applyPlayerTargeting(
  world: World,
  entity: MechEntity,
  contact: OrderedContact,
  holdingFire: boolean,
): void {
  if (contact.target !== null && isOperational(contact.target)) {
    entity.targetId = contact.visible ? contact.target.id : null;
    entity.calledShot = contact.visible ? (entity.orders.attack?.calledShot ?? null) : null;
    return;
  }

  entity.orders.attack = null;
  entity.calledShot = null;
  if (holdingFire) {
    entity.targetId = null;
    return;
  }

  if (entity.posture === 'return_fire') {
    const threat = findEntity(world, entity.threatenedBy);
    const remembered = world.tick <= entity.threatenedUntilTick;
    entity.targetId =
      remembered &&
      threat !== null &&
      isOperational(threat) &&
      isVisibleTo(visionFor(world, entity.team), threat)
        ? threat.id
        : null;
    return;
  }

  entity.targetId = autoAcquire(world, entity)?.id ?? null;
}

/**
 * The contact an attack-moving mech should stop for: something visible and
 * inside the reach of a gun it is actually carrying. Passing sensor ghosts do
 * not halt an advance; a target worth shooting does.
 */
export function engageWorthTarget(world: World, entity: MechEntity): MechEntity | null {
  const reach = longestReach(world, entity);
  if (reach === 0) return null;

  const target = autoAcquire(world, entity);
  if (target === null) return null;
  return distance(entity.pos, target.pos) <= reach ? target : null;
}
