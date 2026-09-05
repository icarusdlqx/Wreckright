import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_MUTED_KEY } from './audioPreference';
import { MIXER_GAIN_COUNT } from './audioMixer';
import { SCORE_CLOSE_DELAY_MS, SCORE_LEVEL, SCORE_NODE_COUNT } from './audioScoreGraph';
import {
  FakeContext,
  type FakeOscillator,
  scoreParams,
  targetAt,
} from './audioScoreGraphTestSupport';
import { SCORE_CULTURE_VOICINGS } from './audioScoreVoicing';
import { STRATEGIC_SCORE_TREATMENTS } from './audioScoreTreatments';
import { StrategicScoreDirector } from './audioStrategic';

function installFakeAudio(initialMuted = false) {
  vi.useFakeTimers();
  vi.stubGlobal('AudioContext', FakeContext as unknown as typeof AudioContext);
  const stored = new Map<string, string>();
  if (initialMuted) stored.set(AUDIO_MUTED_KEY, '1');
  const setItem = vi.fn((key: string, value: string) => stored.set(key, value));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem,
  });
  return { setItem };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeContext.instances.length = 0;
});

describe('strategic score director', () => {
  it('caches a campaign treatment until a gesture creates one fixed graph', () => {
    installFakeAudio();
    const director = new StrategicScoreDirector();
    const campaign = director.acquire('campaign', 0);
    expect(FakeContext.instances).toHaveLength(0);

    director.prepare();
    const context = FakeContext.instances[0]!;
    const params = scoreParams(context);
    expect(context.sources).toHaveLength(5);
    expect(context.gains.length - MIXER_GAIN_COUNT + context.filters.length + context.sources.length)
      .toBe(SCORE_NODE_COUNT);
    expect(params.level.value).toBeCloseTo(
      SCORE_LEVEL * STRATEGIC_SCORE_TREATMENTS.campaign.level,
    );
    expect(params.intensity[1]?.value).toBe(0);
    expect(params.full.value).toBe(0);
    expect(context.sources.every((source) => source.starts.length === 1)).toBe(true);

    campaign.release();
    expect(context.sources.every((source) => source.stops.length === 1)).toBe(true);
    vi.advanceTimersByTime(SCORE_CLOSE_DELAY_MS);
    expect(context.closeCalls).toBe(1);
  });

  it('lets a nested bay override and restore its campaign without allocating nodes', () => {
    installFakeAudio();
    const director = new StrategicScoreDirector();
    const campaign = director.acquire('campaign', 0);
    director.prepare();
    const context = FakeContext.instances[0]!;
    const counts = [context.sources.length, context.gains.length, context.filters.length];

    context.currentTime = 6;
    const mechbay = director.acquire('mechbay', 1);
    const params = scoreParams(context);
    expect(targetAt(params.level, 6)?.value).toBeCloseTo(
      SCORE_LEVEL * STRATEGIC_SCORE_TREATMENTS.mechbay.level,
    );
    expect(targetAt(params.intensity[1]!, 6)?.value).toBeGreaterThan(0);
    expect(targetAt(params.full, 6)?.value).toBe(0);
    expect(targetAt(params.culture[0]!, 6)?.value)
      .toBeCloseTo(SCORE_CULTURE_VOICINGS.aurelian.rootHz);

    context.currentTime = 7;
    campaign.update(1);
    expect(targetAt(params.culture[0]!, 7)).toBeUndefined();
    context.currentTime = 8;
    mechbay.release();
    expect(targetAt(params.level, 8)?.value).toBeCloseTo(
      SCORE_LEVEL * STRATEGIC_SCORE_TREATMENTS.campaign.level,
    );
    expect(targetAt(params.intensity[1]!, 8)?.value).toBe(0);
    expect([context.sources.length, context.gains.length, context.filters.length]).toEqual(counts);
    expect(context.sources.every((source) => source.starts.length === 1)).toBe(true);
    campaign.release();
  });

  it('flushes the newest sparse update after the graph cadence', () => {
    installFakeAudio();
    const director = new StrategicScoreDirector();
    const campaign = director.acquire('campaign', 0);
    director.prepare();
    const context = FakeContext.instances[0]!;
    const mechbay = director.acquire('mechbay', 0);
    mechbay.update(1);
    const culture = scoreParams(context).culture[0]!;
    expect(targetAt(culture, 5)).toBeUndefined();

    context.currentTime = 5.13;
    vi.advanceTimersByTime(126);
    expect(targetAt(culture, 5.13)?.value).toBeCloseTo(SCORE_CULTURE_VOICINGS.aurelian.rootHz);
    mechbay.release();
    campaign.release();
  });

  it('mutes without rebuilding and follows the legacy preference', () => {
    const { setItem } = installFakeAudio(true);
    const director = new StrategicScoreDirector();
    const lease = director.acquire('campaign', 0.5);
    director.prepare();
    const context = FakeContext.instances[0]!;
    const sourceIds = (context.sources as FakeOscillator[]).map((source) => source);
    expect(context.gains[0]?.gain.value).toBe(0);
    expect(director.muted).toBe(true);

    expect(director.toggleMuted()).toBe(false);
    expect(context.gains[0]?.gain.value).toBe(0.5);
    expect(context.sources).toEqual(sourceIds);
    expect(context.sources.every((source) => source.starts.length === 1)).toBe(true);
    expect(setItem).toHaveBeenCalledWith(AUDIO_MUTED_KEY, '0');
    lease.release();
  });

  it('accounts for every source across ten complete strategic visits', () => {
    installFakeAudio();
    const director = new StrategicScoreDirector();
    for (let visit = 0; visit < 10; visit += 1) {
      const lease = director.acquire('campaign', visit % 2);
      director.prepare();
      const context = FakeContext.instances.at(-1)!;
      lease.release();
      expect(context.sources.every((source) => source.starts.length === 1)).toBe(true);
      expect(context.sources.every((source) => source.stops.length === 1)).toBe(true);
      vi.advanceTimersByTime(SCORE_CLOSE_DELAY_MS);
      expect(context.closeCalls).toBe(1);
    }
    expect(FakeContext.instances).toHaveLength(10);
    expect(FakeContext.instances.flatMap((context) => context.sources)).toHaveLength(50);
    director.destroy();
  });
});
