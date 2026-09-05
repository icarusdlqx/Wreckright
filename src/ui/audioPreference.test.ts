import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_MUTED_KEY,
  AUDIO_SETTINGS_KEY,
  DEFAULT_AUDIO_PREFERENCES,
  readAudioMuted,
  readAudioPreferences,
  subscribeAudioPreferences,
  writeAudioMuted,
  writeAudioPreferences,
} from './audioPreference';

let stored: Map<string, string>;
beforeEach(() => {
  stored = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('shared sound preferences', () => {
  it('uses the original mix and the legacy mute key without a migration', () => {
    expect(readAudioPreferences()).toEqual(DEFAULT_AUDIO_PREFERENCES);
    stored.set(AUDIO_MUTED_KEY, '1');
    expect(readAudioMuted()).toBe(true);
    expect(readAudioPreferences().music).toBe(1);
    writeAudioMuted(false);
    expect(stored.get(AUDIO_MUTED_KEY)).toBe('0');
    expect(stored.has(AUDIO_SETTINGS_KEY)).toBe(false);
  });

  it('persists four independent trims and range, retaining mute across mix edits', () => {
    writeAudioMuted(true);
    writeAudioPreferences({ master: 0.8, effects: 0.6, music: 0.2, interface: 0.9, dynamicRange: 'quiet' });
    expect(JSON.parse(stored.get(AUDIO_SETTINGS_KEY)!)).toEqual({
      version: 1, master: 0.8, effects: 0.6, music: 0.2, interface: 0.9, dynamicRange: 'quiet',
    });
    expect(stored.get(AUDIO_MUTED_KEY)).toBe('1');
    expect(readAudioPreferences()).toEqual({
      muted: true, master: 0.8, effects: 0.6, music: 0.2, interface: 0.9, dynamicRange: 'quiet',
    });
    // A new storage wrapper models reloading the saved values in a fresh route.
    vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null });
    expect(readAudioPreferences().music).toBe(0.2);
    expect(readAudioMuted()).toBe(true);
  });

  it.each(['{broken', '[]', 'null', '{"version":99,"music":0}'])(
    'rejects malformed or unsupported settings %s', (raw) => {
      stored.set(AUDIO_SETTINGS_KEY, raw);
      stored.set(AUDIO_MUTED_KEY, '1');
      expect(readAudioPreferences()).toEqual({ ...DEFAULT_AUDIO_PREFERENCES, muted: true });
    },
  );

  it('clamps numeric trims, rejects non-numbers and ignores unknown fields', () => {
    stored.set(AUDIO_SETTINGS_KEY, JSON.stringify({
      version: 1, master: -1, effects: 9, music: '0', interface: null,
      dynamicRange: 'loud', muted: true, future: 500,
    }));
    expect(readAudioPreferences()).toEqual({ ...DEFAULT_AUDIO_PREFERENCES, master: 0 });
    writeAudioPreferences({ master: Number.NaN, music: Infinity });
    expect(readAudioPreferences().master).toBe(1);
    expect(readAudioPreferences().music).toBe(1);
  });

  it('keeps a stable snapshot and notifies every active view synchronously', () => {
    const first = readAudioPreferences();
    expect(readAudioPreferences()).toBe(first);
    const listener = vi.fn();
    const unsubscribe = subscribeAudioPreferences(listener);
    writeAudioPreferences({ effects: 0.4 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(readAudioPreferences()).not.toBe(first);
    expect(readAudioPreferences()).toBe(readAudioPreferences());
    unsubscribe();
    writeAudioPreferences({ effects: 0.7 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps sound controls working when browser storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('storage denied'); },
      setItem: () => { throw new Error('storage denied'); },
    });
    writeAudioPreferences({ muted: true, music: 0.3 });
    expect(readAudioPreferences().music).toBe(0.3);
    expect(readAudioMuted()).toBe(true);
    writeAudioMuted(false);
    expect(readAudioMuted()).toBe(false);
  });

  it('follows cross-tab mix and legacy mute changes and releases its listener', () => {
    const window = new EventTarget();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    vi.stubGlobal('window', window);
    const listener = vi.fn();
    const unsubscribe = subscribeAudioPreferences(listener);
    readAudioPreferences();
    stored.set(AUDIO_MUTED_KEY, '1');
    const event = Object.assign(new Event('storage'), { key: AUDIO_MUTED_KEY });
    window.dispatchEvent(event);
    expect(readAudioMuted()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
