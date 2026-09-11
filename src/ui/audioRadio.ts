import type { Faction } from '../schema/faction';
import { blip, crack, noiseSweep, type VoiceBus } from './audioGraph';

/** Radio keying identifies the caller's machine culture without imitating speech. */
export function playPilotRadio(bus: VoiceBus, faction: Faction): void {
  const frame = bus.begin({ level: .085, distance: null });
  if (frame === null) return;
  if (faction === 'linewrought') {
    crack(frame, frame.now, .04, 1900);
    noiseSweep(frame, frame.now + .02, .13, 1200, 700, .08, 'bandpass', 1.5);
    blip(frame, frame.now + .06, 640, .06, .035);
  } else {
    blip(frame, frame.now, 980, .06, .04);
    blip(frame, frame.now + .08, 1470, .08, .03);
  }
}
