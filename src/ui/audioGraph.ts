import { AudioMixer } from './audioMixer';

export interface VoicePlacement {
  /** The gain before the shared compressor. */
  level: number;
  /** Null keeps a console sound out of the battlefield's air filter. */
  distance: number | null;
  /** Camera-relative stereo; console reports remain centred regardless of this value. */
  pan?: number;
}

export interface VoiceFrame {
  context: AudioContext;
  noise: AudioBuffer;
  now: number;
  out: GainNode;
  random(): number;
}

export type VoicePriority = 'ordinary' | 'terminal';

export interface VoiceBus {
  begin(placement: VoicePlacement, priority?: VoicePriority): VoiceFrame | null;
}

export interface AmbientBus {
  readonly context: AudioContext;
  readonly master: GainNode;
  readonly noise: AudioBuffer;
  random(): number;
}

export const FIELD_VOICE_LIMIT = 8;
export const FIELD_VOICE_WINDOW_MS = 100;
/** A terminal blast and its landing must survive an already saturated volley. */
export const TERMINAL_VOICE_RESERVE = 2;
/** Restart storms may leave at most two contexts finishing their short fade. */
export const PENDING_AUDIO_CLOSE_LIMIT = 2;

const MAX_AUDIO_CLOSE_DELAY_MS = 1_000;

interface PendingAudioClose {
  finish(): void;
}

const pendingAudioCloses: PendingAudioClose[] = [];

/** The shared graph and the admission control in front of every one-shot. */
export class AudioGraph implements VoiceBus, AmbientBus {
  private readonly window = { at: 0, ordinary: 0, terminal: 0 };
  private seed = 0x9e3779b9;
  private closed = false;
  readonly mixer: AudioMixer;
  readonly musicBus: Pick<AmbientBus, 'context' | 'master'>;
  readonly ambientBus: AmbientBus;

  constructor(
    readonly context: AudioContext,
    readonly master: GainNode,
    readonly noise: AudioBuffer,
    compressor: DynamicsCompressorNode | null = null,
    muted?: boolean,
  ) {
    this.mixer = new AudioMixer(context, master, compressor, muted);
    this.musicBus = { context, master: this.mixer.music };
    this.ambientBus = {
      context, master: this.mixer.effects, noise, random: () => this.random(),
    };
  }

  static create(muted: boolean): AudioGraph | null {
    const Ctor =
      (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor === undefined) return null;

    const context = new Ctor();
    const compressor = context.createDynamicsCompressor();
    compressor.connect(context.destination);

    const master = context.createGain();
    master.connect(compressor);

    const noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const graph = new AudioGraph(context, master, noise, compressor, muted);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = graph.random() * 2 - 1;
    return graph;
  }

  setMuted(muted: boolean): void {
    this.mixer.setMuted(muted);
  }

  resume(): void {
    if (!this.closed && this.context.state === 'suspended') void this.context.resume();
  }

  close(delayMs = 0): void {
    if (this.closed) return;
    this.closed = true;
    this.mixer.destroy();
    const boundedDelay = Number.isFinite(delayMs)
      ? Math.min(MAX_AUDIO_CLOSE_DELAY_MS, Math.max(0, delayMs))
      : 0;
    if (boundedDelay === 0) {
      closeContext(this.context);
      return;
    }

    while (pendingAudioCloses.length >= PENDING_AUDIO_CLOSE_LIMIT) {
      pendingAudioCloses[0]?.finish();
    }

    let finished = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pending: PendingAudioClose = {
      finish: (): void => {
        if (finished) return;
        finished = true;
        if (timer !== null) clearTimeout(timer);
        const index = pendingAudioCloses.indexOf(pending);
        if (index >= 0) pendingAudioCloses.splice(index, 1);
        closeContext(this.context);
      },
    };
    pendingAudioCloses.push(pending);
    timer = setTimeout(pending.finish, boundedDelay);
  }

  /** Refuses excess field voices before they can allocate a source node. */
  begin(placement: VoicePlacement, priority: VoicePriority = 'ordinary'): VoiceFrame | null {
    const channel = placement.distance === null ? 'interface' : 'effects';
    if (this.closed || !Number.isFinite(placement.level) || placement.level <= 0.01
      || !this.mixer.audible(channel)) return null;

    if (placement.distance !== null) {
      const now = performance.now();
      if (now - this.window.at > FIELD_VOICE_WINDOW_MS) {
        this.window.at = now;
        this.window.ordinary = 0;
        this.window.terminal = 0;
      }
      if (priority === 'terminal') {
        if (
          this.window.terminal >= TERMINAL_VOICE_RESERVE
          || this.window.ordinary + this.window.terminal >= FIELD_VOICE_LIMIT
        ) return null;
        this.window.terminal += 1;
      } else {
        if (
          this.window.ordinary >= FIELD_VOICE_LIMIT - TERMINAL_VOICE_RESERVE
          || this.window.ordinary + this.window.terminal >= FIELD_VOICE_LIMIT
        ) return null;
        this.window.ordinary += 1;
      }
    }

    const out = this.context.createGain();
    out.gain.value = Math.min(1, placement.level);
    if (placement.distance === null) {
      out.connect(this.mixer.interface);
    } else {
      const air = this.context.createBiquadFilter();
      air.type = 'lowpass';
      air.frequency.value = Math.max(600, 18_000 - placement.distance * 22);
      out.connect(air);
      if (typeof this.context.createStereoPanner === 'function') {
        const stereo = this.context.createStereoPanner();
        const pan = placement.pan ?? 0;
        stereo.pan.value = Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0;
        air.connect(stereo).connect(this.mixer.effects);
      } else {
        // Older embedded browsers keep the same voice and privacy limits in mono.
        air.connect(this.mixer.effects);
      }
    }

    return {
      context: this.context,
      noise: this.noise,
      now: this.context.currentTime,
      out,
      random: () => this.random(),
    };
  }

  /** Local xorshift, so detune never leans on the battle's seeded stream. */
  random(): number {
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5;
    return ((this.seed >>> 0) % 10_000) / 10_000;
  }
}

function closeContext(context: AudioContext): void {
  try {
    void context.close().catch(() => undefined);
  } catch {
    // A browser may synchronously reject a context already being discarded.
  }
}

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
