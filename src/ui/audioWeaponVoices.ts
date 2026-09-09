import type { Faction } from '../schema/faction';
import { body, crack, noiseSweep, oscillator, type VoiceBus, type VoiceFrame, type VoicePlacement } from './audioGraph';

/** One admitted voice contains the entire salvo; culture colours the mechanism, never its family. */
export function playWeapon(bus: VoiceBus, faction: Faction, style: string, projectiles: number, placement: VoicePlacement): void {
  // Leave headroom for the score and the two reserved destruction voices in a full salvo.
  const frame = bus.begin({ ...placement, level: placement.level * 0.88 });
  if (frame === null) return;
  const precise = faction === 'aurelian';
  const count = Number.isFinite(projectiles) ? Math.max(1, Math.round(projectiles)) : 1;
  switch (style) {
    case 'beam': laser(frame, precise); return;
    case 'pulse': pulse(frame, precise); return;
    case 'bolt': particle(frame, precise); return;
    case 'slug': gauss(frame, precise); return;
    case 'missile': missile(frame, precise, Math.min(6, count)); return;
    case 'flame': flame(frame, precise); return;
    default: cannon(frame, precise, Math.min(5, Math.max(1, Math.round(count / 2))));
  }
}

/** Metal rings in unequal partials; a short tail leaves room for the next order. */
function mechanism(frame: VoiceFrame, at: number, precise: boolean, gain: number): void {
  oscillator(frame, at, precise ? 0.1 : 0.18, precise ? 580 : 370, precise ? 530 : 290, gain, 'triangle');
  body(frame, at, precise ? 0.07 : 0.14, precise ? 2_200 : 1_300, 340, gain * 1.5, precise ? 0.8 : 1.4);
}

function cannon(frame: VoiceFrame, precise: boolean, rounds: number): void {
  let last = frame.now;
  for (let i = 0; i < rounds; i += 1) {
    // The muzzle speaks immediately; only later recoil cycles vary.
    const at = frame.now + i * 0.07 + (i === 0 || precise ? 0 : frame.random() * 0.014);
    crack(frame, at, precise ? 0.17 : 0.2, precise ? 2_600 : 1_800);
    body(frame, at, precise ? 0.16 : 0.21, precise ? 3_500 : 2_500, 160, 0.24, 0.9);
    pressure(frame, at, 0.2, precise ? 136 : 112 + frame.random() * 16, 38, 0.22);
    last = at;
  }
  mechanism(frame, last + (precise ? 0.045 : 0.09), precise, 0.045);
}

function missile(frame: VoiceFrame, precise: boolean, count: number): void {
  pressure(frame, frame.now, 0.13, 104, 42, 0.26);
  for (let i = 0; i < count; i += 1) {
    const at = frame.now + i * (precise ? 0.058 : 0.07);
    body(frame, at, 0.07, precise ? 1_500 : 1_050, 200, 0.23, 0.6);
    noiseSweep(frame, at, precise ? 0.31 : 0.38, precise ? 620 : 390, 2_900, 0.22, 'bandpass', precise ? 1.5 : 0.7);
  }
  // Ejector noise is separate from the rising rocket exhaust.
  mechanism(frame, frame.now + 0.02, precise, 0.025);
}

function gauss(frame: VoiceFrame, precise: boolean): void {
  crack(frame, frame.now, 0.26, 2_400);
  pressure(frame, frame.now, 0.38, precise ? 126 : 108, 29, 0.24);
  body(frame, frame.now, 0.18, 1_650, 115, 0.2, 0.7);
  oscillator(frame, frame.now, 0.095, precise ? 2_600 : 1_950, 560, 0.05, 'triangle');
  mechanism(frame, frame.now + (precise ? 0.045 : 0.08), precise, 0.035);
}

function laser(frame: VoiceFrame, precise: boolean): void {
  crack(frame, frame.now, 0.1, 3_900);
  noiseSweep(frame, frame.now, 0.34, precise ? 3_600 : 2_900, 1_300, precise ? 0.14 : 0.2, 'bandpass', 2.1);
  heldCoil(frame, frame.now, 0.29, precise ? 1_420 : 1_160, 740, 0.065, 'triangle');
  heldCoil(frame, frame.now + 0.035, 0.22, precise ? 2_130 : 1_750, 1_110, 0.035, 'sine');
  pressure(frame, frame.now, 0.1, 130, 65, 0.09);
}

function pulse(frame: VoiceFrame, precise: boolean): void {
  for (let i = 0; i < 3; i += 1) {
    const at = frame.now + i * (precise ? 0.07 : 0.078);
    crack(frame, at, 0.085, 3_400);
    noiseSweep(frame, at, 0.065, precise ? 4_100 : 3_300, 1_100, 0.18, 'bandpass', 1.8);
    oscillator(frame, at, 0.072, precise ? 1_860 : 1_540, 640, 0.14, 'triangle');
  }
}

function particle(frame: VoiceFrame, precise: boolean): void {
  crack(frame, frame.now, 0.26, 2_600);
  body(frame, frame.now, 0.3, 6_400, 280, 0.18, 1.2);
  pressure(frame, frame.now, 0.36, 165, 39, 0.1);
  oscillator(frame, frame.now, 0.24, precise ? 2_300 : 1_700, 190, 0.06, precise ? 'sine' : 'triangle');
  noiseSweep(frame, frame.now + 0.03, 0.33, 4_700, 630, 0.11, 'bandpass', precise ? 2.3 : 1.2);
}

function flame(frame: VoiceFrame, precise: boolean): void {
  body(frame, frame.now, 0.09, 750, 220, 0.23, 0.7);
  noiseSweep(frame, frame.now, 0.46, precise ? 1_300 : 950, 300, 0.34, 'lowpass', 0.6);
  noiseSweep(frame, frame.now, 0.36, 3_100, precise ? 1_200 : 680, 0.13, 'bandpass', 0.6);
}

/** Pressure builds behind the crack; hard-started subs add coherently in a six-gun volley. */
function pressure(frame: VoiceFrame, at: number, seconds: number, from: number, to: number, gain: number): void {
  const source = frame.context.createOscillator();
  source.type = 'sine';
  source.frequency.setValueAtTime(from, at);
  source.frequency.exponentialRampToValueAtTime(to, at + seconds);
  const level = frame.context.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(gain, at + 0.008);
  level.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  source.connect(level).connect(frame.out);
  source.start(at);
  source.stop(at + seconds + 0.02);
}

/** A beam holds its core before releasing, unlike the decaying report of a gun. */
function heldCoil(frame: VoiceFrame, at: number, seconds: number, from: number, to: number, gain: number, type: OscillatorType): void {
  const source = frame.context.createOscillator();
  source.type = type;
  source.frequency.setValueAtTime(from, at);
  source.frequency.exponentialRampToValueAtTime(to, at + seconds);
  const level = frame.context.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  level.gain.setValueAtTime(gain, at + seconds * 0.55);
  level.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  source.connect(level).connect(frame.out);
  source.start(at);
  source.stop(at + seconds + 0.02);
}
