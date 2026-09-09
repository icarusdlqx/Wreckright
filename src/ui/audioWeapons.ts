import type { Weapon } from '../schema/weapon';
export { playWeapon } from './audioWeaponVoices';
import {
  body,
  crack,
  noiseSweep,
  oscillator,
  thump,
  type VoiceBus,
  type VoicePlacement,
} from './audioGraph';

export interface ImpactVoiceProfile {
  type: Weapon['type'];
  style: Weapon['visual']['style'];
  damage: number;
}

export type DestructionVoiceProfile =
  | { kind: 'ammo'; damage: number }
  | { kind: 'terminal'; tonnage: number };

/** The struck plate identifies the projectile before the damage readout does. */
export function playImpact(
  bus: VoiceBus,
  profile: ImpactVoiceProfile,
  placement: VoicePlacement,
): void {
  const frame = bus.begin(scaled(placement, 0.7));
  if (frame === null) return;
  const weight = bounded(profile.damage / 24, 0.08, 1.25);
  const heavy = profile.damage >= 12;

  if (profile.type === 'energy') {
    if (profile.style === 'flame') {
      noiseSweep(
        frame,
        frame.now,
        heavy ? 0.34 : 0.2,
        2_600,
        420,
        0.12 + weight * 0.18,
        'bandpass',
        2.8,
      );
    } else {
      crack(frame, frame.now, 0.12 + weight * 0.2, profile.style === 'bolt' ? 4_200 : 5_200);
      body(
        frame,
        frame.now,
        heavy ? 0.28 : 0.12,
        profile.style === 'bolt' ? 7_600 : 6_200,
        heavy ? 420 : 900,
        0.14 + weight * 0.2,
        profile.style === 'bolt' ? 6 : 4.5,
      );
    }
    if (heavy || profile.style === 'bolt') {
      oscillator(frame, frame.now, 0.18 + weight * 0.08, 210, 70, 0.1 + weight * 0.12, 'triangle');
    }
    return;
  }

  if (profile.type === 'missile') {
    const seconds = 0.16 + weight * 0.24;
    crack(frame, frame.now, 0.18 + weight * 0.2, 1_100);
    noiseSweep(frame, frame.now, seconds, 2_800, 220, 0.22 + weight * 0.2, 'lowpass', 1.3);
    thump(frame, frame.now, seconds * 0.75, 100 + weight * 40, 36, 0.18 + weight * 0.3);
    if (heavy) body(frame, frame.now, seconds * 0.8, 1_600, 100, 0.28, 1.8);
    return;
  }

  const seconds = 0.12 + weight * 0.22;
  crack(frame, frame.now, 0.2 + weight * 0.25, 1_500);
  body(frame, frame.now, seconds, 2_400, 140, 0.25 + weight * 0.25, 2.4);
  thump(frame, frame.now, seconds * 0.9, 130 + weight * 35, 45, 0.25 + weight * 0.38);
  if (heavy) noiseSweep(frame, frame.now, seconds * 0.75, 1_800, 180, 0.16, 'lowpass');
}

/** Structure failing: the tear first, then the weight of it coming apart. */
export function playCrunch(bus: VoiceBus, placement: VoicePlacement): void {
  const frame = bus.begin(placement);
  if (frame === null) return;
  crack(frame, frame.now, 0.45, 1200);
  body(frame, frame.now, 0.28, 3000, 200, 0.4, 1.1);
  thump(frame, frame.now + 0.04, 0.34, 110, 34, 0.5);
  oscillator(frame, frame.now + 0.025, 0.22, 470, 190, 0.1, 'triangle');
  noiseSweep(frame, frame.now + 0.07, 0.4, 2100, 160, 0.19, 'bandpass', 1.3);
}

/** Ammunition ruptures inside plate; a terminal blast moves the air outside it. */
export function playDestruction(
  bus: VoiceBus,
  profile: DestructionVoiceProfile,
  placement: VoicePlacement,
): void {
  const frame = bus.begin(placement, profile.kind === 'terminal' ? 'terminal' : 'ordinary');
  if (frame === null) return;
  if (profile.kind === 'ammo') {
    const size = bounded(profile.damage / 60, 0.2, 1.25);
    const seconds = 0.28 + size * 0.32;
    crack(frame, frame.now, 0.4 + size * 0.2, 900);
    body(frame, frame.now, seconds, 3_800, 160, 0.36 + size * 0.18, 1.2);
    noiseSweep(frame, frame.now, seconds * 0.75, 6_500, 800, 0.16 + size * 0.14, 'bandpass', 2.6);
    thump(frame, frame.now, 0.2 + size * 0.12, 120, 40, 0.32 + size * 0.28);
    oscillator(frame, frame.now, 0.2, 510, 145, 0.11, 'triangle');
    return;
  }

  const size = bounded(profile.tonnage / 100, 0.3, 1.35);
  const seconds = 0.75 + size * 0.55;
  crack(frame, frame.now, 0.32, 1_150);
  // A looping noise bed finishes its envelope instead of exhausting the one-second buffer mid-blast.
  noiseSweep(frame, frame.now, seconds, 1_800, 70, 0.56, 'lowpass', 0.6);
  oscillator(frame, frame.now, seconds * 0.85, 65, 24, 0.55 + size * 0.25, 'sine');
  body(frame, frame.now, 0.34 + size * 0.18, 1_100, 80, 0.28 + size * 0.12, 0.8);
  noiseSweep(frame, frame.now, seconds * 0.72, 3_900, 240, 0.16, 'bandpass', 1.1);
}

function scaled(placement: VoicePlacement, factor: number): VoicePlacement {
  return { ...placement, level: placement.level * factor };
}

function bounded(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
