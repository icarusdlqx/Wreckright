import {
  blip,
  body,
  crack,
  noiseSweep,
  thump,
  type VoiceBus,
  type VoicePlacement,
} from './audioGraph';

export type SupportAudioCue = 'probe' | 'air' | 'repair';

export function supportAudioCue(call: string): SupportAudioCue | null {
  if (call === 'sensor_probe') return 'probe';
  if (call === 'air_strike') return 'air';
  if (call === 'repair_truck') return 'repair';
  return null;
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

  if (cue === 'probe') {
    noiseSweep(frame, at, 0.46, 380, 3_400, 0.12, 'bandpass', 4.8);
    blip(frame, at + 0.04, 980, 0.09, 0.1);
    blip(frame, at + 0.2, 1_460, 0.1, 0.08);
    return;
  }

  if (cue === 'air') {
    noiseSweep(frame, at, 0.62, 2_500, 260, 0.2, 'lowpass', 0.7);
    crack(frame, at, 0.22, 1_200);
    thump(frame, at, 0.38, 96, 34, 0.3);
    return;
  }

  body(frame, at, 0.62, 720, 120, 0.18, 2.6);
  blip(frame, at + 0.1, 430, 0.08, 0.09);
  blip(frame, at + 0.3, 640, 0.1, 0.08);
}

/** Console acknowledgments bypass distance and the battlefield's voice quota. */
export function playSupportAcknowledgment(bus: VoiceBus, call: string): void {
  const cue = supportAudioCue(call);
  if (cue === null && call !== 'artillery_strike') return;
  const frame = bus.begin({ level: 0.46, distance: null });
  if (frame === null) return;
  const frequency = cue === 'probe' ? 980 : cue === 'repair' ? 540 : 720;
  blip(frame, frame.now, frequency, 0.07, 0.14);
  blip(frame, frame.now + 0.11, frequency * 1.25, 0.09, 0.1);
}
