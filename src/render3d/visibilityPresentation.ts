import { findEntity, isOperational, type EntityId, type MechEntity, type World } from '../sim/types';
import type { PendingCall } from '../sim/support';

/** A long campaign cannot turn every once-seen wreck into permanent render state. */
export const PRESENTED_HULK_LIMIT = 64;

interface PresentedHulks {
  vision: World['vision'];
  known: Set<EntityId>;
  ids: Set<EntityId>;
  order: EntityId[];
}

const presentedByWorld = new WeakMap<World, PresentedHulks>();

function boundedObservedHulks(world: World): ReadonlySet<EntityId> {
  const vision = world.vision;
  if (vision === null) return new Set();
  let presented = presentedByWorld.get(world);
  if (presented === undefined || presented.vision !== vision) {
    presented = { vision, known: new Set(), ids: new Set(), order: [] };
    presentedByWorld.set(world, presented);
  }
  for (const id of vision.observedHulks) {
    if (presented.known.has(id)) continue;
    const entity = findEntity(world, id);
    if (entity === null || !entity.destroyed) continue;
    presented.known.add(id);
    presented.ids.add(id);
    presented.order.push(id);
    if (presented.order.length <= PRESENTED_HULK_LIMIT) continue;
    const retired = presented.order.shift();
    if (retired !== undefined) presented.ids.delete(retired);
  }
  return presented.ids;
}

/** The shared boundary for exact models, readouts, event copy, smoke and VFX. */
export function canPresentEntity(world: World, id: EntityId): boolean {
  const entity = findEntity(world, id);
  if (entity === null) return false;
  const vision = world.vision;
  if (vision === null || entity.team === vision.team || vision.visible.has(id)) return true;
  return entity.destroyed &&
    vision.observedHulks.has(id) &&
    boundedObservedHulks(world).has(id);
}

/** Hostile support is disclosed only where the player's current optics see it land. */
export function canPresentSupportCall(world: World, pending: PendingCall): boolean {
  if (world.playerTeam === null || pending.team === world.playerTeam) return true;
  if (pending.call !== 'artillery_strike' && pending.call !== 'air_strike') return false;
  const vision = world.vision;
  if (vision === null) return false;
  const tile = world.terrain.toTile(pending.target);
  if (!world.terrain.inBounds(tile.column, tile.row)) return false;
  if (vision.tiles[tile.row * world.terrain.width + tile.column] === 1) return true;
  const threatened = world.entities.filter((entity) =>
    entity.team === world.playerTeam && isOperational(entity),
  );
  return pending.call === 'artillery_strike'
    ? threatened.some((entity) => artilleryThreatens(world, pending, entity))
    : threatened.some((entity) => airStrikeThreatens(world, pending, entity));
}

function artilleryThreatens(world: World, pending: PendingCall, entity: MechEntity): boolean {
  const rules = world.rules.support.artillery_strike;
  return Math.hypot(entity.pos.x - pending.target.x, entity.pos.y - pending.target.y) <=
    rules.radius + rules.scatter;
}

function airStrikeThreatens(world: World, pending: PendingCall, entity: MechEntity): boolean {
  const rules = world.rules.support.air_strike;
  const spacing = rules.length / rules.shots;
  const halfLine = rules.length / 2 - spacing / 2;
  const dx = entity.pos.x - pending.target.x;
  const dy = entity.pos.y - pending.target.y;
  const along = dx * Math.cos(pending.heading) + dy * Math.sin(pending.heading);
  const clamped = Math.max(-halfLine, Math.min(halfLine, along));
  const nearest = {
    x: pending.target.x + Math.cos(pending.heading) * clamped,
    y: pending.target.y + Math.sin(pending.heading) * clamped,
  };
  return Math.hypot(entity.pos.x - nearest.x, entity.pos.y - nearest.y) <= rules.width / 2;
}
