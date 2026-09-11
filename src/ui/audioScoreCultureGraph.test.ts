vi.mock('./audioScoreAssets', () => import('./audioScoreTestAssets'));
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioDirector } from './audio';
import { PENDING_AUDIO_CLOSE_LIMIT } from './audioGraph';
import { MIXER_GAIN_COUNT } from './audioMixer';
import {
  SCORE_CLOSE_DELAY_MS,
  SCORE_FILTER_COUNT,
  SCORE_GAIN_COUNT,
  SCORE_NODE_COUNT,
  SCORE_SOURCE_COUNT,
} from './audioScoreGraph';
import {
  callsAt,
  cultureWorld,
  FakeContext,
  flushScoreLoad,
  fired,
  scoreParams,
  sensorDetect,
  targetAt,
} from './audioScoreGraphTestSupport';

function installFakeAudio(): { setItem: ReturnType<typeof vi.fn> } {
  vi.useFakeTimers();
  vi.stubGlobal('AudioContext', FakeContext as unknown as typeof AudioContext);
  const setItem = vi.fn();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem });
  return { setItem };
}

function latestContext(): FakeContext {
  const context = FakeContext.instances.at(-1);
  if (context === undefined) throw new Error('score test needs an audio context');
  return context;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeContext.instances.length = 0;
});

describe('culture score in the audio director', () => {
  it('drops pre-unlock pressure, caches culture, and keeps tracking while muted', async () => {
    const { setItem } = installFakeAudio();
    const { world, ally, enemy } = cultureWorld('score-cached-culture', 'aurelian');
    const event = fired(world, ally, enemy);
    const audio = new AudioDirector();
    audio.consume(world, Array.from({ length: 8 }, () => ({ ...event })));
    audio.unlock();
    await flushScoreLoad();

    const context = latestContext();
    expect(scoreParams(context).culture.map(param => param.value)).toEqual([0, 1]);
    const targetsBefore = scoreParams(context).intensity.map((param) => param.targets.length);
    audio.consume(world, []);
    expect(scoreParams(context).intensity.map((param) => param.targets.length))
      .toEqual(targetsBefore);

    expect(audio.toggleMuted()).toBe(true);
    expect(context.gains[0]?.gain.value).toBe(0);
    context.currentTime = 6;
    audio.consume(world, Array.from({ length: 8 }, () => ({ ...event })));
    expect(scoreParams(context).intensity.every((param) => callsAt(param, 6).length === 2))
      .toBe(true);
    expect(context.sources).toHaveLength(SCORE_SOURCE_COUNT);
    expect(context.sources.every((source) => source.starts.length === 1)).toBe(true);
    expect(audio.toggleMuted()).toBe(false);
    expect(context.gains[0]?.gain.value).toBe(0.5);
    expect(setItem).toHaveBeenCalledTimes(2);

    audio.destroy();
    vi.advanceTimersByTime(SCORE_CLOSE_DELAY_MS);
    expect(context.closeCalls).toBe(1);
  });

  it('never voices hidden or sensor-only hostile culture, but morphs on optical reveal', async () => {
    installFakeAudio();
    const { world, enemy } = cultureWorld('score-culture-privacy', 'linewrought');
    const audio = new AudioDirector();
    audio.consume(world, []);
    audio.unlock();
    await flushScoreLoad();
    const context = latestContext();
    const culture = scoreParams(context).culture;
    expect(culture.every((param) => param.automation.length === 0)).toBe(true);

    context.currentTime = 6;
    audio.consume(world, []);
    expect(culture.every((param) => callsAt(param, 6).length === 0)).toBe(true);
    sensorDetect(world, enemy);
    context.currentTime = 6.2;
    audio.consume(world, []);
    expect(culture.every((param) => callsAt(param, 6.2).length === 0)).toBe(true);

    world.vision?.visible.add(enemy.id);
    context.currentTime = 6.4;
    audio.consume(world, []);
    expect(culture.every((param) => callsAt(param, 6.4).length === 2)).toBe(true);
    expect(targetAt(culture[0]!, 6.4)?.value).toBeCloseTo(Math.SQRT1_2, 8);

    world.vision?.visible.delete(enemy.id);
    context.currentTime = 6.6;
    audio.consume(world, []);
    expect(culture.every((param) => callsAt(param, 6.6).length === 2)).toBe(true);
    expect(targetAt(culture[0]!, 6.6)?.value)
      .toBeCloseTo(1, 8);
    audio.destroy();
    vi.advanceTimersByTime(SCORE_CLOSE_DELAY_MS);
  });
});

describe('fixed score lifetime in the audio director', () => {
  it('starts and stops exactly 30 score sources across ten complete battles', async () => {
    installFakeAudio();
    for (let battle = 0; battle < 10; battle += 1) {
      const audio = new AudioDirector();
      audio.unlock();
    await flushScoreLoad();
      const context = latestContext();
      expect(context.sources).toHaveLength(SCORE_SOURCE_COUNT);
      expect(context.gains).toHaveLength(SCORE_GAIN_COUNT + MIXER_GAIN_COUNT);
      expect(context.filters).toHaveLength(SCORE_FILTER_COUNT);
      expect(context.sources.length + context.gains.length - MIXER_GAIN_COUNT + context.filters.length)
        .toBe(SCORE_NODE_COUNT);
      audio.destroy();
      audio.destroy();
      expect(context.sources.every((source) => source.stops.length === 1)).toBe(true);
      vi.advanceTimersByTime(SCORE_CLOSE_DELAY_MS);
      expect(context.closeCalls).toBe(1);
    }

    const sources = FakeContext.instances.flatMap((context) => context.sources);
    expect(FakeContext.instances).toHaveLength(10);
    expect(sources).toHaveLength(30);
    expect(sources.every((source) => source.starts.length === 1)).toBe(true);
    expect(sources.every((source) => source.stops.length === 1)).toBe(true);
    expect(FakeContext.instances.every(
      (context) => context.state === 'closed' && context.closeCalls === 1,
    )).toBe(true);
  });

  it('bounds open contexts during a ten-battle restart storm', async () => {
    installFakeAudio();
    for (let battle = 0; battle < 10; battle += 1) {
      const audio = new AudioDirector();
      audio.unlock();
    await flushScoreLoad();
      audio.destroy();
    }

    expect(FakeContext.instances).toHaveLength(10);
    expect(FakeContext.instances.flatMap((context) => context.sources)).toHaveLength(30);
    expect(FakeContext.instances.filter((context) => context.state !== 'closed'))
      .toHaveLength(PENDING_AUDIO_CLOSE_LIMIT);
    expect(FakeContext.instances.every(
      (context) => context.sources.every((source) => source.stops.length === 1),
    )).toBe(true);

    vi.advanceTimersByTime(SCORE_CLOSE_DELAY_MS);
    expect(FakeContext.instances.every(
      (context) => context.state === 'closed' && context.closeCalls === 1,
    )).toBe(true);
  });
});
