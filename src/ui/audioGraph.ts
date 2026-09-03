import {
  DEFAULT_AUDIO_LEVELS,
  clampAudioLevel,
  type AudioLevelKind,
  type AudioLevels,
} from './audioPreference';

export { blip, body, crack, noiseSweep, oscillator, thump } from './audioSynth';

export interface VoicePlacement {
  /** The gain before the shared compressor. */
  level: number;
  /** Null keeps a console sound out of the battlefield's air filter. */
  distance: number | null;
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

const MASTER_LEVEL = 0.5;
export const FIELD_VOICE_LIMIT = 8;
export const FIELD_VOICE_WINDOW_MS = 100;
/** A terminal blast and its landing must survive an already saturated volley. */
export const TERMINAL_VOICE_RESERVE = 2;
/** Overflow past the full-level slots is mixed down rather than dropped, up to this many. */
export const FIELD_QUIET_VOICE_LIMIT = 4;
/** About -10 dB: present under the ranked voices, never competing with them. */
export const QUIET_MIX_GAIN = 0.316;
/** Master, effects and score: the gains a graph owns before any voice or score is built. */
export const GRAPH_BUS_GAIN_COUNT = 3;
/** Restart storms may leave at most two contexts finishing their short fade. */
export const PENDING_AUDIO_CLOSE_LIMIT = 2;
/** A blast pushes the score down to this fraction before it climbs back. */
export const SCORE_DUCK_FLOOR = 0.4;
export const SCORE_DUCK_HOLD_SECONDS = 0.25;
export const SCORE_DUCK_RECOVER_SECONDS = 1.5;

const MAX_AUDIO_CLOSE_DELAY_MS = 1_000;
const DUCK_ATTACK_SECONDS = 0.03;
const LEVEL_FOLLOW_SECONDS = 0.02;

interface PendingAudioClose {
  finish(): void;
}

const pendingAudioCloses: PendingAudioClose[] = [];

/** The shared graph and the admission control in front of every one-shot. */
export class AudioGraph implements VoiceBus, AmbientBus {
  /** Every one-shot voice; the effects slider trims this without touching the score. */
  readonly effects: GainNode;
  /** The score and the ambient bed, ducked together under a blast. */
  readonly score: GainNode;

  private readonly window = { at: 0, ordinary: 0, quiet: 0, terminal: 0 };
  private readonly levels: AudioLevels;
  private muted: boolean;
  private seed = 0x9e3779b9;
  private closed = false;

  constructor(
    readonly context: AudioContext,
    readonly master: GainNode,
    readonly noise: AudioBuffer,
    muted = false,
    levels: Readonly<AudioLevels> = DEFAULT_AUDIO_LEVELS,
  ) {
    this.muted = muted;
    this.levels = { ...levels };
    this.effects = context.createGain();
    this.effects.gain.value = this.levels.effects;
    this.effects.connect(master);
    this.score = context.createGain();
    this.score.gain.value = this.levels.score;
    this.score.connect(master);
    this.applyMaster();
  }

  static create(muted: boolean, levels: Readonly<AudioLevels> = DEFAULT_AUDIO_LEVELS): AudioGraph | null {
    const Ctor =
      (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor === undefined) return null;

    const context = new Ctor();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 8;
    compressor.connect(context.destination);

    const master = context.createGain();
    master.connect(compressor);

    const noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const graph = new AudioGraph(context, master, noise, muted, levels);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = graph.random() * 2 - 1;
    return graph;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMaster();
  }

  setLevel(kind: AudioLevelKind, value: number): void {
    const level = clampAudioLevel(value);
    this.levels[kind] = level;
    if (kind === 'master') {
      this.applyMaster();
    } else if (kind === 'effects') {
      this.effects.gain.value = level;
    } else if (!this.closed) {
      // The score bus may be mid-duck; automation keeps the slider from clicking.
      const at = this.context.currentTime;
      this.score.gain.cancelScheduledValues(at);
      this.score.gain.setTargetAtTime(level, at, LEVEL_FOLLOW_SECONDS);
    }
  }

  /** Ambient and score hang off their own bus so one slider and one duck reach both. */
  scoreBus(): AmbientBus {
    return {
      context: this.context,
      master: this.score,
      noise: this.noise,
      random: () => this.random(),
    };
  }

  /** Continuous effects (a stressed reactor) share the effects trim with the one-shots. */
  effectsBus(): AmbientBus {
    return {
      context: this.context,
      master: this.effects,
      noise: this.noise,
      random: () => this.random(),
    };
  }

  /** A blast pushes the score aside for a moment; it returns as the dust settles. */
  duckScore(): void {
    if (this.closed) return;
    const at = this.context.currentTime;
    const gain = this.score.gain;
    gain.cancelScheduledValues(at);
    gain.setTargetAtTime(this.levels.score * SCORE_DUCK_FLOOR, at, DUCK_ATTACK_SECONDS);
    gain.setTargetAtTime(
      this.levels.score,
      at + SCORE_DUCK_HOLD_SECONDS,
      SCORE_DUCK_RECOVER_SECONDS / 3,
    );
  }

  resume(): void {
    if (!this.closed && this.context.state === 'suspended') void this.context.resume();
  }

  close(delayMs = 0): void {
    if (this.closed) return;
    this.closed = true;
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

  /**
   * Refuses excess field voices before they can allocate a source node. The
   * caller offers voices best-first, so the full slots go to what matters and
   * the overflow sits underneath at the quiet mix until the hard cap.
   */
  begin(placement: VoicePlacement, priority: VoicePriority = 'ordinary'): VoiceFrame | null {
    if (this.closed || placement.level <= 0.01) return null;

    let quiet = false;
    if (placement.distance !== null) {
      const now = performance.now();
      if (now - this.window.at > FIELD_VOICE_WINDOW_MS) {
        this.window.at = now;
        this.window.ordinary = 0;
        this.window.quiet = 0;
        this.window.terminal = 0;
      }
      if (priority === 'terminal') {
        if (
          this.window.terminal >= TERMINAL_VOICE_RESERVE
          || this.window.ordinary + this.window.terminal >= FIELD_VOICE_LIMIT
        ) return null;
        this.window.terminal += 1;
      } else if (this.window.ordinary < FIELD_VOICE_LIMIT - TERMINAL_VOICE_RESERVE) {
        this.window.ordinary += 1;
      } else if (this.window.quiet < FIELD_QUIET_VOICE_LIMIT) {
        this.window.quiet += 1;
        quiet = true;
      } else {
        return null;
      }
    }

    const out = this.context.createGain();
    out.gain.value = Math.min(1, placement.level) * (quiet ? QUIET_MIX_GAIN : 1);
    if (placement.distance === null) {
      out.connect(this.effects);
    } else {
      const air = this.context.createBiquadFilter();
      air.type = 'lowpass';
      air.frequency.value = Math.max(600, 18_000 - placement.distance * 22);
      out.connect(air).connect(this.effects);
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

  private applyMaster(): void {
    this.master.gain.value = this.muted ? 0 : MASTER_LEVEL * this.levels.master;
  }
}

function closeContext(context: AudioContext): void {
  try {
    void context.close().catch(() => undefined);
  } catch {
    // A browser may synchronously reject a context already being discarded.
  }
}
