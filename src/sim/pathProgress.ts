import type { MechEntity, Vec2 } from './types';

/**
 * Installs a route with a fresh progress baseline. A retry keeps its strike
 * count, but distance and elapsed ticks only mean anything for the waypoints
 * that produced them.
 */
export function replacePath(entity: MechEntity, path: Vec2[]): void {
  entity.path = path;
  entity.pathIndex = 0;
  entity.stalledTicks = 0;
  entity.closestApproach = Number.POSITIVE_INFINITY;
}
