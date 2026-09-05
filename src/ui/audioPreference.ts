export const AUDIO_MUTED_KEY = 'ironline.muted';
export const AUDIO_SETTINGS_KEY = 'ironline.audio-settings';

export interface AudioPreferences {
  muted: boolean;
  master: number;
  effects: number;
  music: number;
  interface: number;
  dynamicRange: 'normal' | 'quiet';
}

/** Unit trims retain the existing mix; master gain still has its original 0.5 trim. */
export const DEFAULT_AUDIO_PREFERENCES: Readonly<AudioPreferences> = Object.freeze({
  muted: false, master: 1, effects: 1, music: 1, interface: 1, dynamicRange: 'normal',
});

const listeners = new Set<() => void>();
let snapshot = DEFAULT_AUDIO_PREFERENCES;
let previousStorage: Storage | null | undefined;
let previousSettings: string | null = null;
let previousMute: string | null = null;

/** Stable snapshots also keep controls usable when a browser refuses persistence. */
export function readAudioPreferences(): Readonly<AudioPreferences> {
  const stored = storageValues();
  if (stored.storage !== previousStorage || stored.settings !== previousSettings
    || stored.mute !== previousMute) {
    remember(stored);
    let value: unknown = null;
    try { value = JSON.parse(stored.settings ?? 'null'); } catch { /* Use the default mix. */ }
    const record = isRecord(value) && value.version === 1 ? value : {};
    snapshot = Object.freeze({
      muted: stored.mute === '1',
      master: volume(record.master),
      effects: volume(record.effects),
      music: volume(record.music),
      interface: volume(record.interface),
      dynamicRange: record.dynamicRange === 'quiet' ? 'quiet' : 'normal',
    });
  }
  return snapshot;
}

export function writeAudioPreferences(patch: Partial<AudioPreferences>): void {
  const current = readAudioPreferences();
  const next = { ...current, ...patch };
  snapshot = Object.freeze({
    muted: typeof next.muted === 'boolean' ? next.muted : current.muted,
    master: volume(next.master), effects: volume(next.effects),
    music: volume(next.music), interface: volume(next.interface),
    dynamicRange: next.dynamicRange === 'quiet' ? 'quiet' : 'normal',
  });
  const { muted, ...mix } = snapshot;
  try {
    const storage = globalThis.localStorage;
    if (patch.muted !== undefined) storage?.setItem(AUDIO_MUTED_KEY, muted ? '1' : '0');
    if (Object.keys(patch).some((key) => key !== 'muted')) {
      storage?.setItem(AUDIO_SETTINGS_KEY, JSON.stringify({ version: 1, ...mix }));
    }
  } catch { /* The current visit still keeps the chosen mix. */ }
  remember(storageValues());
  emit();
}

export function subscribeAudioPreferences(listener: () => void): () => void {
  if (listeners.size === 0) globalThis.window?.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) globalThis.window?.removeEventListener('storage', onStorage);
  };
}

/** The legacy key remains authoritative for existing saves and sound buttons. */
export function readAudioMuted(): boolean { return readAudioPreferences().muted; }
export function writeAudioMuted(muted: boolean): void { writeAudioPreferences({ muted }); }

function volume(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value)) : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function storageValues(): { storage: Storage | null; settings: string | null; mute: string | null } {
  try {
    const storage = globalThis.localStorage ?? null;
    return {
      storage, settings: storage?.getItem(AUDIO_SETTINGS_KEY) ?? null,
      mute: storage?.getItem(AUDIO_MUTED_KEY) ?? null,
    };
  } catch { return { storage: null, settings: null, mute: null }; }
}

function remember(stored: ReturnType<typeof storageValues>): void {
  previousStorage = stored.storage;
  previousSettings = stored.settings;
  previousMute = stored.mute;
}

function onStorage(event: StorageEvent): void {
  if (event.key === null || event.key === AUDIO_SETTINGS_KEY || event.key === AUDIO_MUTED_KEY) {
    readAudioPreferences();
    emit();
  }
}

function emit(): void { for (const listener of listeners) listener(); }
