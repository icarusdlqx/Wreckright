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
): Pilot {
  if (team === playerTeam || skillDelta === undefined || skillDelta === 0) return pilot;
  return {
    ...pilot,
    gunnery: clampSkill(pilot.gunnery + skillDelta),
    piloting: clampSkill(pilot.piloting + skillDelta),
    sensors: clampSkill(pilot.sensors + skillDelta),
  };
}
