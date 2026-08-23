import type { ObjectiveState } from '../sim/objectives';
import { isOperational, type World } from '../sim/types';

export interface StoppedCount {
  stopped: number;
  total: number;
}

/** Counts only losses whose fate the player's force has optically established. */
export function stoppedCount(
  world: World,
  objective: ObjectiveState,
): StoppedCount | undefined {
  if (objective.type !== 'destroy_all') return undefined;
  const enemies = world.entities.filter((entity) => entity.team !== objective.team);
  return {
    stopped: enemies.filter((entity) => (
      !isOperational(entity) && (
        world.vision === null ||
        world.vision.visible.has(entity.id) ||
        world.vision.observedHulks.has(entity.id)
      )
    )).length,
    total: enemies.length,
  };
}
