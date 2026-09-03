import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioDirector } from './audio';
import {
  AUDIO_LEVEL_KEYS,
  AUDIO_MUTED_KEY,
  clampAudioLevel,
  readAudioLevels,
  writeAudioLevel,
} from './audioPreference';
import { FakeContext } from './audioScoreGraphTestSupport';
import { StrategicScoreDirector } from './audioStrategic';

function installStorage(seed: Record<string, string> = {}): Map<string, string> {
  const stored = new Map(Object.entries(seed));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
  return stored;
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeContext.instances.length = 0;
});

describe('audio level preference', () => {
  it('defaults to full level and round-trips each bus beside the mute key', () => {
    const stored = installStorage({ [AUDIO_MUTED_KEY]: '1' });
    expect(readAudioLevels()).toEqual({ master: 1, effects: 1, score: 1 });
    writeAudioLevel('effects', 0.35);
    writeAudioLevel('score', 0);
    expect(stored.get(AUDIO_LEVEL_KEYS.effects)).toBe('0.35');
    expect(stored.get(AUDIO_LEVEL_KEYS.score)).toBe('0');
    expect(stored.get(AUDIO_MUTED_KEY)).toBe('1');
    expect(readAudioLevels()).toEqual({ master: 1, effects: 0.35, score: 0 });
  });

  it('treats a hand-edited or missing store as a unit level', () => {
    installStorage({
      [AUDIO_LEVEL_KEYS.master]: '7',
      [AUDIO_LEVEL_KEYS.effects]: 'loud',
      [AUDIO_LEVEL_KEYS.score]: '-2',
    });
    expect(readAudioLevels()).toEqual({ master: 1, effects: 1, score: 0 });
    expect(clampAudioLevel(Number.NaN)).toBe(1);
    expect(clampAudioLevel(0.25)).toBe(0.25);
    vi.stubGlobal('localStorage', undefined);
    expect(readAudioLevels()).toEqual({ master: 1, effects: 1, score: 1 });
    expect(() => writeAudioLevel('master', 0.5)).not.toThrow();
  });
});

describe('level controls on the battle graph', () => {
  it('trims master, effects and score independently and survives a mute', () => {
    installStorage();
    vi.stubGlobal('AudioContext', FakeContext as unknown as typeof AudioContext);
    const audio = new AudioDirector();
    audio.unlock();
    const context = FakeContext.instances[0]!;
    const [master, effects, score] = context.gains;
    expect(master?.gain.value).toBe(0.5);
    expect(effects?.gain.value).toBe(1);

    audio.setLevel('master', 0.5);
    audio.setLevel('effects', 0.3);
    audio.setLevel('score', 0.6);
    expect(master?.gain.value).toBeCloseTo(0.25);
    expect(effects?.gain.value).toBeCloseTo(0.3);
    expect(score?.gain.targets.at(-1)?.value).toBeCloseTo(0.6);
    expect(audio.levels).toEqual({ master: 0.5, effects: 0.3, score: 0.6 });

    expect(audio.toggleMuted()).toBe(true);
    expect(master?.gain.value).toBe(0);
    expect(audio.toggleMuted()).toBe(false);
    expect(master?.gain.value).toBeCloseTo(0.25);
    audio.destroy();

    const next = new AudioDirector();
    expect(next.levels).toEqual({ master: 0.5, effects: 0.3, score: 0.6 });
    next.unlock();
    const [nextMaster, nextEffects, nextScore] = FakeContext.instances[1]!.gains;
    expect(nextMaster?.gain.value).toBeCloseTo(0.25);
    expect(nextEffects?.gain.value).toBeCloseTo(0.3);
    expect(nextScore?.gain.value).toBeCloseTo(0.6);
    next.destroy();
  });

  it('lets the strategic score follow a level the battle menu wrote', () => {
    installStorage();
    vi.stubGlobal('AudioContext', FakeContext as unknown as typeof AudioContext);
    const director = new StrategicScoreDirector();
    const listener = vi.fn();
    director.subscribe(listener);
    const lease = director.acquire('campaign', 0.5);
    director.prepare();
    const [master, , score] = FakeContext.instances[0]!.gains;

    director.setLevel('master', 0.2);
    expect(master?.gain.value).toBeCloseTo(0.1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(readAudioLevels().master).toBe(0.2);

    writeAudioLevel('score', 0.4);
    director.prepare();
    expect(score?.gain.targets.at(-1)?.value).toBeCloseTo(0.4);
    expect(director.levels).toEqual({ master: 0.2, effects: 1, score: 0.4 });
    lease.release();
    director.destroy();
  });
});
