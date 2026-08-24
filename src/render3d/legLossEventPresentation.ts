import type { SimEvent } from '../sim/events';
import { findEntity, type EntityId, type World } from '../sim/types';

interface VisibleMotionGate {
  canAnimateVisibleEvent(world: World, id: EntityId): boolean;
}

interface LegLossMotionSink {
  triggerLegLoss(id: EntityId, location: 'left_leg' | 'right_leg'): void;
}

/** Routes only the event the player just saw; persistent limp comes from entity state. */
export function routeVisibleLegLoss(
  world: World,
  event: SimEvent,
  visibility: VisibleMotionGate,
  motion: LegLossMotionSink,
): boolean {
  if (
    event.type !== 'location_destroyed' ||
    (event.location !== 'left_leg' && event.location !== 'right_leg') ||
    !visibility.canAnimateVisibleEvent(world, event.entityId)
  ) return false;

  const entity = findEntity(world, event.entityId);
  if (
    entity === null || entity.frame !== 'mech' || entity.destroyed ||
    entity.downRemaining > 0 || entity.shutdownRemaining > 0 ||
    entity.locations.left_leg.destroyed === entity.locations.right_leg.destroyed
  ) return false;
  motion.triggerLegLoss(event.entityId, event.location);
  return true;
}
