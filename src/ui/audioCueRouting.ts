import { canPresentEntity } from '../render3d/visibilityPresentation';
import type { SimEvent } from '../sim/events';
import type { World } from '../sim/types';
import type { VoicePlacement } from './audioGraph';

export type LifecycleMoment = Extract<
  SimEvent['type'],
  'stood_up' | 'pilot_ejected' | 'unit_withdrew'
>;

export function isPlayerConsoleCue(world: World, event: SimEvent): boolean {
  if (event.type === 'mission_message') return true;
  if (event.type !== 'ability_used' && event.type !== 'alpha_strike') return false;
  const entity = world.entities.find((candidate) => candidate.id === event.entityId);
  return entity?.team === (world.playerTeam ?? 0);
}

/** Prefer the player's report when several machines cross the same lifecycle in one tick. */
export function preferredLifecycleEntity(
  world: World,
  events: readonly SimEvent[],
  moment: Extract<LifecycleMoment, 'pilot_ejected' | 'unit_withdrew'>,
): number | null {
  let firstPresentable: number | null = null;
  for (const event of events) {
    if (event.type !== moment || !canPresentEntity(world, event.entityId)) continue;
    const entity = world.entities.find((candidate) => candidate.id === event.entityId);
    if (entity === undefined) continue;
    if (entity.team === (world.playerTeam ?? 0)) return entity.id;
    firstPresentable ??= entity.id;
  }
  return firstPresentable;
}

/** Safety and withdrawal reports stay audible at the console across the largest maps. */
export function lifecyclePlacement(
  moment: LifecycleMoment,
  field: VoicePlacement,
): VoicePlacement {
  if (moment === 'pilot_ejected') return { level: 0.12, distance: null };
  if (moment === 'unit_withdrew') return { level: 0.085, distance: null };
  return field;
}
