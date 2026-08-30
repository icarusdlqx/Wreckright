import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioDirector } from './audio';
import { SCORE_CLOSE_DELAY_MS, SCORE_LEVEL } from './audioScoreGraph';
import {
  FakeContext,
  type FakeOscillator,
  cultureWorld,
  scoreParams,
  targetAt,
} from './audioScoreGraphTestSupport';
import { SCORE_CULTURE_VOICINGS } from './audioScoreVoicing';
import { STRATEGIC_SCORE_TREATMENTS } from './audioScoreTreatments';

function installFakeAudio(): void {
  vi.useFakeTimers();
  vi.stubGlobal('AudioContext', FakeContext as unknown as typeof AudioContext);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeContext.instances.length = 0;
});

describe('battle mechbay score treatment', () => {
  it('temporarily reuses and restores the fixed battle graph', () => {
    installFakeAudio();
    const { world } = cultureWorld('battle-mechbay-score', 'linewrought');
    const audio = new AudioDirector();
    audio.consume(world, []);
    audio.unlock();
    const context = FakeContext.instances[0]!;
    const counts = [context.sources.length, context.gains.length, context.filters.length];
    const params = scoreParams(context);

    context.currentTime = 6;
    audio.setMechbayScore(1);
    expect(targetAt(params.level, 6)?.value).toBeCloseTo(
      SCORE_LEVEL * STRATEGIC_SCORE_TREATMENTS.mechbay.level,
    );
    expect(targetAt(params.intensity[1]!, 6)?.value).toBeGreaterThan(0);
    expect(targetAt(params.full, 6)?.value).toBe(0);
    expect(targetAt(params.culture[0]!, 6)?.value)
      .toBeCloseTo(SCORE_CULTURE_VOICINGS.aurelian.rootHz);

    context.currentTime = 7;
    audio.clearMechbayScore();
    expect(targetAt(params.level, 7)?.value).toBeCloseTo(SCORE_LEVEL);
    expect(targetAt(params.intensity[1]!, 7)?.value).toBe(0);
    expect(targetAt(params.culture[0]!, 7)?.value)
      .toBeCloseTo(SCORE_CULTURE_VOICINGS.linewrought.rootHz);
    expect([context.sources.length, context.gains.length, context.filters.length]).toEqual(counts);
    expect(context.sources.every((source) => source.starts.length === 1)).toBe(true);

    audio.destroy();
    expect(context.sources.every((source) => source.stops.length === 1)).toBe(true);
    vi.advanceTimersByTime(SCORE_CLOSE_DELAY_MS);
    expect(context.closeCalls).toBe(1);
  });

  it('caches a bay treatment before unlock and keeps mute on the same sources', () => {
    installFakeAudio();
    const audio = new AudioDirector();
    audio.setMechbayScore(1);
    expect(FakeContext.instances).toHaveLength(0);
    audio.unlock();
    const context = FakeContext.instances[0]!;
    const params = scoreParams(context);
    expect(params.level.value).toBeCloseTo(
      SCORE_LEVEL * STRATEGIC_SCORE_TREATMENTS.mechbay.level,
    );
    expect((context.sources[0] as FakeOscillator | undefined)?.frequency.value)
      .toBeCloseTo(SCORE_CULTURE_VOICINGS.aurelian.rootHz);
    audio.toggleMuted();
    expect(context.gains[0]?.gain.value).toBe(0);
    expect(context.sources.every((source) => source.starts.length === 1)).toBe(true);
    audio.destroy();
  });

  it('restores primed battle culture when a briefing bay closes before the first sim step', () => {
    installFakeAudio();
    const { world } = cultureWorld('battle-mechbay-prime', 'aurelian');
    const audio = new AudioDirector();
    audio.primeScore(world);
    audio.setMechbayScore(0);
    audio.unlock();
    const context = FakeContext.instances[0]!;
    const culture = scoreParams(context).culture[0]!;
    expect((context.sources[0] as FakeOscillator | undefined)?.frequency.value)
      .toBeCloseTo(SCORE_CULTURE_VOICINGS.linewrought.rootHz);

    context.currentTime = 6;
    audio.clearMechbayScore();
    expect(targetAt(culture, 6)?.value).toBeCloseTo(SCORE_CULTURE_VOICINGS.aurelian.rootHz);
    audio.destroy();
  });
});
