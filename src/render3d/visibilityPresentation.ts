import { findEntity, type EntityId, type World } from '../sim/types';

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
