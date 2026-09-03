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

export type SupportAudioCue = 'probe' | 'air' | 'repair' | 'artillery' | 'mines' | 'reinforce';

const SUPPORT_CUES: Readonly<Record<string, SupportAudioCue>> = {
  sensor_probe: 'probe',
  air_strike: 'air',
  repair_truck: 'repair',
  artillery_strike: 'artillery',
  minelayer: 'mines',
  reinforcement: 'reinforce',
};

export function supportAudioCue(call: string): SupportAudioCue | null {
  return SUPPORT_CUES[call] ?? null;
}

/** One admitted field voice per resolution, even when the cue has several layers. */
export function playSupportResolution(
  bus: VoiceBus,
  call: string,
  placement: VoicePlacement,
): void {
  const cue = supportAudioCue(call);
  if (cue === null) return;
  const frame = bus.begin(placement);
  if (frame === null) return;
  const at = frame.now;

  switch (cue) {
    case 'probe':
      noiseSweep(frame, at, 0.46, 380, 3_400, 0.12, 'bandpass', 4.8);
      blip(frame, at + 0.04, 980, 0.09, 0.1);
      blip(frame, at + 0.2, 1_460, 0.1, 0.08);
      return;
    case 'air':
      noiseSweep(frame, at, 0.82, 5_200, 260, 0.25, 'lowpass', 0.7);
      crack(frame, at + 0.14, 0.22, 1_200);
      thump(frame, at + 0.36, 0.38, 96, 34, 0.3);
      return;
    case 'repair':
      body(frame, at, 0.62, 720, 120, 0.18, 2.6);
      blip(frame, at + 0.1, 430, 0.08, 0.09);
      blip(frame, at + 0.3, 640, 0.1, 0.08);
      return;
    case 'artillery':
      // The shells arrive on ground_impact; this is the whistle that precedes them.
      oscillator(frame, at, 0.9, 2_600, 700, 0.09, 'sine');
      noiseSweep(frame, at, 0.9, 3_800, 1_200, 0.1, 'bandpass', 2.4);
      return;
    case 'mines':
      for (let i = 0; i < 3; i += 1) {
        const drop = at + i * 0.13 + frame.random() * 0.02;
        crack(frame, drop, 0.16, 1_600);
        thump(frame, drop, 0.09, 140, 60, 0.18);
      }
      blip(frame, at + 0.42, 520, 0.08, 0.06);
      return;
    case 'reinforce':
      noiseSweep(frame, at, 1.1, 180, 900, 0.22, 'lowpass', 0.9);
      oscillator(frame, at, 1.0, 44, 70, 0.2, 'sine');
      blip(frame, at + 0.5, 700, 0.07, 0.06);
      blip(frame, at + 0.62, 940, 0.09, 0.06);
      return;
  }
}

/** The console acknowledging a call before the field answers it. */
export function playSupportAcknowledged(bus: VoiceBus): void {
  const frame = bus.begin({ level: 0.09, distance: null });
  if (frame === null) return;
  blip(frame, frame.now, 760, 0.05, 0.07);
  blip(frame, frame.now + 0.07, 1_020, 0.07, 0.06);
}

/** A shell landing: air moved first, then the ground remembering it. */
export function playGroundImpact(bus: VoiceBus, placement: VoicePlacement): void {
  const frame = bus.begin(placement);
  if (frame === null) return;
  crack(frame, frame.now, 0.55, 800);
  body(frame, frame.now, 0.5, 3_200, 90, 0.5, 1.6);
  noiseSweep(frame, frame.now + 0.02, 0.6, 2_400, 140, 0.22, 'lowpass', 0.9);
  thump(frame, frame.now, 0.48, 90, 22, 0.75);
}
