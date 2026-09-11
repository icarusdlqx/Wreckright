import type { Pilot } from '../schema/pilot';

function clampSkill(value: number): number {
  return Math.max(1, Math.min(5, value));
}

/** Player crews keep their authored skills; every autonomous side follows the chosen tier. */
export function pilotAtDifficulty(
  pilot: Pilot,
  team: number,
  playerTeam: number | null,
  skillDelta: number | undefined,
  playerSkillDelta?: number,
): Pilot {
  const delta = team === playerTeam ? playerSkillDelta : skillDelta;
  if (delta === undefined || delta === 0) return pilot;
  return {
    ...pilot,
    gunnery: clampSkill(pilot.gunnery + delta),
    piloting: clampSkill(pilot.piloting + delta),
    sensors: clampSkill(pilot.sensors + delta),
  };
}
