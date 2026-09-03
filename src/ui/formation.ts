import {
  formationDestinations as layOutFormation,
  type FormationPreset,
} from '../sim/formation';
import type { MechEntity, Vec2, World } from '../sim/types';
import { useGame } from './store';

export {
  formationOffsets,
  formationPoints,
  repairFormationPoint,
  type FormationOffset,
  type FormationPoint,
  type FormationReservation,
  type FormationTerrain,
} from '../sim/formation';

/**
 * The HUD's view of the formation layout: the same geometry as the
 * simulation's, with the picker's current choice filled in when the caller
 * has none. Sampling the choice here fixes it into the issued endpoints;
 * later changes cannot bend a route that is already waiting in the queue.
 */
export function formationDestinations(
  world: World,
  units: readonly MechEntity[],
  destination: Vec2,
  requestedPreset?: FormationPreset,
): Map<number, Vec2> {
  const preset = requestedPreset ?? useGame.getState().formationPreset;
  return layOutFormation(world, units, destination, preset);
}
