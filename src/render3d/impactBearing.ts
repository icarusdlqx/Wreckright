import type { SimEvent } from '../sim/events';
import type { Vec2, World } from '../sim/types';
import { targetCueBearing } from './battleEventPresentation';
import { canPresentEntity } from './visibilityPresentation';

type ImpactEvent = Extract<SimEvent, { type: 'projectile_hit' | 'projectile_miss' }>;

/** Directional debris follows a visible source; hidden sources never enter the resolver. */
export function impactBearing(world: World, event: ImpactEvent, at: Vec2, positionOf: (id: number) => Vec2 | null): number {
  if (canPresentEntity(world, event.shooterId)) {
    const source = positionOf(event.shooterId);
    if (source !== null && Math.hypot(at.x - source.x, at.y - source.y) > .01) {
      return Math.atan2(at.y - source.y, at.x - source.x);
    }
  }
  return targetCueBearing(event) + Math.PI;
}
