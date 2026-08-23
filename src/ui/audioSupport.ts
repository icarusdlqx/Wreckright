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
    noiseSweep(frame, at, 0.82, 5_200, 260, 0.25, 'lowpass', 0.7);
    crack(frame, at + 0.14, 0.22, 1_200);
    thump(frame, at + 0.36, 0.38, 96, 34, 0.3);
    return;
  }

  body(frame, at, 0.62, 720, 120, 0.18, 2.6);
  blip(frame, at + 0.1, 430, 0.08, 0.09);
  blip(frame, at + 0.3, 640, 0.1, 0.08);
}
