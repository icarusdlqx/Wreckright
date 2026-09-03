import { bodyRadius } from './collision';
import { emit } from './events';
import { distance } from './math';
import type { PathOccupancy } from './pathfind';
import { isOperational, type MechEntity, type Vec2, type World } from './types';

/**
 * Where an order can actually end. When the path stops short of the ask — the
 * click was on water, a cliff, the far side of a wall — the order is retargeted
 * to the ground the route reaches. Left pointed at the unreachable spot, the
 * arrival check can never pass, and the mech spends the rest of the battle
 * walking into the bank, stalling, and re-solving the same route.
 */
export function reachableDestination(world: World, path: readonly Vec2[], asked: Vec2): Vec2 {
  const last = path[path.length - 1];
  if (last === undefined || distance(last, asked) <= world.rules.movement.arrivalRadius) {
    return { x: asked.x, y: asked.y };
  }
  return { x: last.x, y: last.y };
}

/**
 * Tiles under lance-mates that did not move last tick. A route that threads
 * straight through a parked machine is a route that ends in a shove and a
 * stall; charging those tiles sends the walker round instead. Anything
 * moving is left out — it will not be there when the walker arrives — and
 * wrecks are ground, not machines.
 */
export function friendlyOccupancy(world: World, entity: MechEntity): PathOccupancy {
  const cells = new Set<number>();
  for (const other of world.entities) {
    if (other.id === entity.id || other.team !== entity.team) continue;
    if (!isOperational(other) || other.jump !== null || other.underway) continue;
    const tile = world.terrain.toTile(other.pos);
    cells.add(tile.row * world.terrain.width + tile.column);
  }
  return { cells, costFactor: world.rules.movement.occupiedTileCostFactor };
}

/** Says where a route was given up, so the map can mark it as well as the log. */
export function reportDroppedOrder(world: World, entity: MechEntity, text: string): void {
  if (entity.autopilot) return;
  emit(world.events, { type: 'mission_message', tick: world.tick, text });
  emit(world.events, {
    type: 'order_dropped',
    tick: world.tick,
    entityId: entity.id,
    x: entity.pos.x,
    y: entity.pos.y,
  });
}

/** How many stalled re-solves mean the route is hopeless and the order drops. */
export const HOPELESS_STRIKES = 3;

/**
 * Whether another machine is parked on the destination, close enough that the
 * walker cannot take the spot, and the walker is already up against it. This
 * is the honest test for "the ground I was sent to is taken".
 */
export function standingOnDestination(world: World, entity: MechEntity, to: Vec2): boolean {
  const reach = bodyRadius(world, entity);
  for (const other of world.entities) {
    if (other.id === entity.id || !isOperational(other) || other.jump !== null) continue;
    const clearance = reach + bodyRadius(world, other);
    if (distance(other.pos, to) > clearance) continue;
    // Something is on the spot; the order is done when the walker is up
    // against that machine rather than still crossing the map towards it.
    if (distance(entity.pos, other.pos) <= clearance + world.rules.movement.arrivalRadius) {
      return true;
    }
  }
  return false;
}
