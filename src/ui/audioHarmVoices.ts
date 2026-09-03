import {
  blip,
  body,
  crack,
  noiseSweep,
  oscillator,
  thump,
  type VoiceBus,
  type VoicePlacement,
} from './audioGraph';

/** Rounds passing the plate: a doppler hiss, and a ricochet when several go by. */
export function playWhizz(bus: VoiceBus, count: number, placement: VoicePlacement): void {
  const frame = bus.begin(placement);
  if (frame === null) return;
  const passes = Math.min(3, Math.max(1, count));
  for (let i = 0; i < passes; i += 1) {
    const at = frame.now + i * (0.045 + frame.random() * 0.03);
    noiseSweep(frame, at, 0.16, 4_200 - i * 500, 900, 0.16, 'bandpass', 3.2);
  }
  if (count >= 2) {
    oscillator(frame, frame.now + 0.03, 0.14, 2_900, 1_100, 0.05, 'triangle');
  }
}

/**
 * A section torn away: longer and higher than the internal crunch, ending in
 * the weight of the piece landing.
 */
export function playTear(bus: VoiceBus, placement: VoicePlacement): void {
  const frame = bus.begin(placement);
  if (frame === null) return;
  crack(frame, frame.now, 0.4, 2_400);
  noiseSweep(frame, frame.now, 0.42, 5_600, 380, 0.34, 'bandpass', 1.6);
  oscillator(frame, frame.now + 0.02, 0.36, 640, 90, 0.16, 'sawtooth');
  crack(frame, frame.now + 0.12, 0.24, 1_400);
  thump(frame, frame.now + 0.3, 0.3, 84, 30, 0.5);
}

/** Gyros fighting a stumble: a servo strain, then the recovering foot. */
export function playStagger(bus: VoiceBus, placement: VoicePlacement): void {
  const frame = bus.begin(placement);
  if (frame === null) return;
  oscillator(frame, frame.now, 0.24, 240, 410, 0.1, 'sawtooth');
  body(frame, frame.now, 0.2, 1_800, 260, 0.26, 1.4);
  thump(frame, frame.now + 0.2, 0.16, 74, 32, 0.42);
}

/** A pilot hurt: the hit through the couch and the cockpit alarm that follows. */
export function playPilotInjury(bus: VoiceBus, placement: VoicePlacement): void {
  const frame = bus.begin(placement);
  if (frame === null) return;
  thump(frame, frame.now, 0.14, 120, 48, 0.4);
  body(frame, frame.now, 0.12, 900, 200, 0.2, 1.2);
  blip(frame, frame.now + 0.08, 1_180, 0.07, 0.07);
  blip(frame, frame.now + 0.19, 1_180, 0.07, 0.06);
}
