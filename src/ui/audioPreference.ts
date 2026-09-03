export const AUDIO_MUTED_KEY = 'ironline.muted';

export type AudioLevelKind = 'master' | 'effects' | 'score';

export interface AudioLevels {
  master: number;
  effects: number;
  score: number;
}

export const AUDIO_LEVEL_KEYS: Readonly<Record<AudioLevelKind, string>> = {
  master: 'ironline.volume.master',
  effects: 'ironline.volume.effects',
  score: 'ironline.volume.score',
};

export const DEFAULT_AUDIO_LEVELS: Readonly<AudioLevels> = { master: 1, effects: 1, score: 1 };

export function readAudioMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(AUDIO_MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeAudioMuted(muted: boolean): void {
  try {
    globalThis.localStorage?.setItem(AUDIO_MUTED_KEY, muted ? '1' : '0');
  } catch {
    // Private browsing; the preference just does not persist.
  }
}

/** A stored level outside the unit range came from a hand-edited store, not the slider. */
export function clampAudioLevel(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}

export function readAudioLevels(): AudioLevels {
  const levels: AudioLevels = { ...DEFAULT_AUDIO_LEVELS };
  for (const kind of Object.keys(AUDIO_LEVEL_KEYS) as AudioLevelKind[]) {
    try {
      const stored = globalThis.localStorage?.getItem(AUDIO_LEVEL_KEYS[kind]);
      if (stored !== null && stored !== undefined && stored !== '') {
        levels[kind] = clampAudioLevel(Number(stored));
      }
    } catch {
      // Storage refused; the default level is the only sensible answer.
    }
  }
  return levels;
}

export function writeAudioLevel(kind: AudioLevelKind, value: number): void {
  try {
    globalThis.localStorage?.setItem(AUDIO_LEVEL_KEYS[kind], String(clampAudioLevel(value)));
  } catch {
    // Private browsing; the level just does not persist.
  }
}
