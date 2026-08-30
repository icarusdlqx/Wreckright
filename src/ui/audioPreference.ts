export const AUDIO_MUTED_KEY = 'ironline.muted';

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
