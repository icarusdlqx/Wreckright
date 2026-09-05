import {
  readAudioPreferences,
  subscribeAudioPreferences,
  type AudioPreferences,
} from './audioPreference';

export const MIXER_GAIN_COUNT = 4;
const MASTER_LEVEL = 0.5;

/** Separate trims share one compressor and add no running sound sources. */
export class AudioMixer {
  readonly effects: GainNode;
  readonly music: GainNode;
  readonly interface: GainNode;
  private readonly unsubscribe: () => void;
  private preferences: Readonly<AudioPreferences>;

  constructor(
    private readonly context: AudioContext,
    readonly master: GainNode,
    private readonly compressor: DynamicsCompressorNode | null = null,
    muted = readAudioPreferences().muted,
  ) {
    this.effects = this.createBus();
    this.music = this.createBus();
    this.interface = this.createBus();
    this.preferences = { ...readAudioPreferences(), muted };
    this.apply(true);
    this.unsubscribe = subscribeAudioPreferences(() => {
      this.preferences = readAudioPreferences();
      this.apply();
    });
  }

  setMuted(muted: boolean): void {
    this.preferences = { ...this.preferences, muted };
    this.apply();
  }

  audible(channel: 'effects' | 'interface'): boolean {
    return !this.preferences.muted && this.preferences.master > 0
      && this.preferences[channel] > 0;
  }

  destroy(): void { this.unsubscribe(); }

  private createBus(): GainNode {
    const node = this.context.createGain();
    node.connect(this.master);
    return node;
  }

  private apply(initial = false): void {
    const prefs = this.preferences;
    const quiet = prefs.dynamicRange === 'quiet';
    const master = prefs.muted ? 0 : MASTER_LEVEL * prefs.master * (quiet ? 0.85 : 1);
    for (const [node, value] of [
      [this.master, master], [this.effects, prefs.effects],
      [this.music, prefs.music], [this.interface, prefs.interface],
    ] as const) {
      if (initial) node.gain.value = value;
      else {
        node.gain.cancelScheduledValues?.(this.context.currentTime);
        if (value === 0) node.gain.setValueAtTime(0, this.context.currentTime);
        else node.gain.setTargetAtTime(value, this.context.currentTime, 0.015);
      }
    }
    if (this.compressor !== null) {
      this.compressor.threshold.value = quiet ? -28 : -18;
      this.compressor.ratio.value = quiet ? 14 : 8;
    }
  }
}
