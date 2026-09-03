/**
 * Half a second of simulation before the lance strip believes a change of
 * gait. A mech pivoting in a fight reports stationary and walking on
 * alternate ticks; the strip flashing between the two read as a fault.
 */
export const MOTION_SETTLE_TICKS = 10;

export interface MotionLabelMemory {
  shown: string;
  candidate: string;
  since: number;
}

/** Returns the gait to show, adopting a new one only once it has held. */
export function settleMotionLabel(
  memory: Map<number, MotionLabelMemory>,
  id: number,
  motion: string,
  tick: number | null,
  holdTicks = MOTION_SETTLE_TICKS,
): string {
  if (tick === null) return motion;
  const entry = memory.get(id);
  if (entry === undefined) {
    memory.set(id, { shown: motion, candidate: motion, since: tick });
    return motion;
  }
  // A restarted battle rewinds the clock; treat it as a fresh sighting.
  if (tick < entry.since) {
    entry.shown = motion;
    entry.candidate = motion;
    entry.since = tick;
    return motion;
  }
  if (motion === entry.shown) {
    entry.candidate = motion;
    entry.since = tick;
    return entry.shown;
  }
  if (motion !== entry.candidate) {
    entry.candidate = motion;
    entry.since = tick;
    return entry.shown;
  }
  // Leaving the ground is never a flicker; it is the one gait shown at once.
  if (motion === 'jump' || tick - entry.since >= holdTicks) {
    entry.shown = motion;
    entry.since = tick;
  }
  return entry.shown;
}
