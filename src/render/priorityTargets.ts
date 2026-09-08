import { findEntity, isOperational, type EntityId, type World } from '../sim/types';

export type TargetFocus = 'priority' | 'inspection';

/** Orders may retain sensor targets; exact brackets require current player optics. */
export function visiblePriorityTargets(
  world: World,
  selection: ReadonlySet<EntityId>,
): ReadonlyMap<EntityId, TargetFocus> {
  const team = world.playerTeam ?? 0;
  const optical = world.vision?.team === team ? world.vision.visible : null;
  const targets = new Map<EntityId, TargetFocus>();
  const visibleHostile = (id: EntityId): boolean => {
    const entity = findEntity(world, id);
    return entity !== null && entity.team !== team && isOperational(entity) && optical?.has(id) === true;
  };
  for (const id of selection) {
    if (visibleHostile(id)) targets.set(id, 'inspection');
  }
  for (const id of selection) {
    const entity = findEntity(world, id);
    if (entity === null || entity.team !== team || entity.autopilot || !isOperational(entity)) continue;
    const target = entity.orders.attack?.targetId;
    if (target !== undefined && visibleHostile(target)) targets.set(target, 'priority');
  }
  return targets;
}
