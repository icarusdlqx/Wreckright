import type { VoiceFrame } from './audioGraph';

/** Broadband attack. Without it a gunshot is only a note with better manners. */
export function crack(frame: VoiceFrame, at: number, gain: number, colour: number): void {
  const src = frame.context.createBufferSource();
  src.buffer = frame.noise;

  const shelf = frame.context.createBiquadFilter();
  shelf.type = 'highpass';
  shelf.frequency.value = colour;

  const level = frame.context.createGain();
  level.gain.setValueAtTime(gain, at);
  level.gain.exponentialRampToValueAtTime(0.0001, at + 0.012);
  src.connect(shelf).connect(level).connect(frame.out);
  src.start(at, frame.random() * 0.5);
  src.stop(at + 0.03);
}

/** Noise through a closing resonance: machinery has a body, not a clean pitch. */
export function body(
  frame: VoiceFrame,
  at: number,
  seconds: number,
  from: number,
  to: number,
  gain: number,
  resonance: number,
): void {
  const src = frame.context.createBufferSource();
  src.buffer = frame.noise;

  const filter = frame.context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(from, at);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), at + seconds);
  filter.Q.value = resonance;

  const level = frame.context.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(gain, at + 0.006);
  level.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  src.connect(filter).connect(level).connect(frame.out);
  src.start(at, frame.random() * 0.5);
  src.stop(at + seconds + 0.02);
}

/** Weight belongs below the noise, where it is felt before it is named. */
export function thump(
  frame: VoiceFrame,
  at: number,
  seconds: number,
  from: number,
  to: number,
  gain: number,
): void {
  oscillator(frame, at, seconds, from, to, gain, 'sine');
}

export function oscillator(
  frame: VoiceFrame,
  at: number,
  seconds: number,
  from: number,
  to: number,
  gain: number,
  type: OscillatorType,
): void {
  const osc = frame.context.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, from), at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + seconds);
  const level = frame.context.createGain();
  level.gain.setValueAtTime(Math.max(0.0001, gain), at);
  level.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  osc.connect(level).connect(frame.out);
  osc.start(at);
  osc.stop(at + seconds + 0.02);
}

export function noiseSweep(
  frame: VoiceFrame,
  at: number,
  seconds: number,
  from: number,
  to: number,
  gain: number,
  type: BiquadFilterType = 'lowpass',
  resonance = 0.8,
): void {
  const src = frame.context.createBufferSource();
  src.buffer = frame.noise;
  src.loop = true;
  const filter = frame.context.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(Math.max(40, from), at);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), at + seconds);
  filter.Q.value = resonance;
  const level = frame.context.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.04, seconds * 0.2));
  level.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  src.connect(filter).connect(level).connect(frame.out);
  src.start(at, frame.random() * 0.5);
  src.stop(at + seconds + 0.02);
}

/** A filtered console tone; bare waveforms make every control sound like a toy. */
export function blip(
  frame: VoiceFrame,
  at: number,
  frequency: number,
  seconds: number,
  gain: number,
): void {
  const osc = frame.context.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(frequency, at);
  osc.frequency.exponentialRampToValueAtTime(frequency * 0.82, at + seconds);
  const soften = frame.context.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = frequency * 2.2;
  const level = frame.context.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(gain, at + 0.004);
  level.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  osc.connect(soften).connect(level).connect(frame.out);
  osc.start(at);
  osc.stop(at + seconds + 0.02);
}
