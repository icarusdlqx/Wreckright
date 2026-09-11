vi.mock('./audioScoreAssets', () => import('./audioScoreTestAssets'));
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthoredScore, SCORE_SOURCE_COUNT, SCORE_GAIN_COUNT, SCORE_NODE_COUNT, SCORE_LEVEL, SCORE_CLOSE_DELAY_MS, rhythmLayerLevel } from './audioScoreGraph';
import { FakeContext, FakeGain, FakeBufferSource, scoreHarness, scoreParams, targetAt } from './audioScoreGraphTestSupport';
import type { ScoreBuffers, ScoreBufferLoader } from './audioScoreAssets';

afterEach(() => { vi.useRealTimers(); FakeContext.instances.length = 0; });

function delayedHarness(loader: ScoreBufferLoader) {
  const context = new FakeContext();
  const handle = createAuthoredScore({ context: context as unknown as AudioContext, master: new FakeGain() as unknown as GainNode }, 0, 1, loader);
  return { context, handle };
}
function buffers(context: AudioContext): ScoreBuffers {
  return [context.createBuffer(2, 8, 8), context.createBuffer(1, 8, 8), context.createBuffer(1, 8, 8)];
}

describe('fixed authored score graph', () => {
  it('starts three synchronized loops through five music gains at fixed tempo', async () => {
    const { context, handle } = scoreHarness();
    expect(context.sources).toHaveLength(SCORE_SOURCE_COUNT);
    expect(context.gains).toHaveLength(SCORE_GAIN_COUNT);
    expect(context.filters).toHaveLength(0);
    expect(context.sources.length + context.gains.length).toBe(SCORE_NODE_COUNT);
    expect(context.sources.every(source => source.starts.length === 0)).toBe(true);
    expect(await handle.ready).toBe(true);
    const sources = context.sources as FakeBufferSource[];
    expect(sources.every(source => source.loop && source.loopEnd > 73 && source.starts[0] === 5.025)).toBe(true);
    expect(sources.map(source => source.buffer?.numberOfChannels)).toEqual([2, 1, 1]);
    const rates = sources.map(source => source.playbackRate.value);
    context.currentTime = 10;
    handle.setState({ intensity: 1, aurelianShare: 1 }, 4);
    expect(sources.map(source => source.playbackRate.value)).toEqual(rates);
    handle.stop();
  });

  it('never allocates more sources or nodes while pressure and culture change', async () => {
    const { context, handle } = scoreHarness();
    await handle.ready;
    const counts = [context.sources.length, context.gains.length, context.filters.length];
    for (let step = 0; step < 1_000; step += 1) {
      context.currentTime = 10 + step * 0.13;
      handle.setState({ intensity: (step % 11) / 10, aurelianShare: (step % 7) / 6 }, 4);
    }
    expect([context.sources.length, context.gains.length, context.filters.length]).toEqual(counts);
    expect(context.sources.every(source => source.starts.length === 1)).toBe(true);
    handle.stop();
  });

  it('keeps rhythm monotonic and bounded while exposing quieter strategic color', () => {
    const levels = Array.from({ length: 101 }, (_, index) => rhythmLayerLevel(index / 100));
    expect(levels[0]).toBeGreaterThan(0);
    expect(levels.at(-1)).toBeLessThanOrEqual(1);
    expect(levels.every((level, index) => index === 0 || level >= levels[index - 1]!)).toBe(true);
  });

  it('uses independent pressure attack/release and speed-scaled gain envelopes', async () => {
    const { context, handle } = scoreHarness(); await handle.ready;
    const rhythm = scoreParams(context).intensity[1]!;
    for (const [at, intensity, speed, seconds] of [[10, .8, 1, .6], [12, .1, 1, 1.6], [14, .9, 4, .15], [16, .05, 4, .4]]) {
      context.currentTime = at!;
      handle.setState({ intensity: intensity!, aurelianShare: 0 }, speed);
      expect(targetAt(rhythm, at!)?.timeConstant).toBeCloseTo(seconds!);
    }
    handle.stop();
  });

  it('crossfades culture endpoints and treatment level without source changes', async () => {
    const { context, handle } = scoreHarness(0, 0); await handle.ready;
    const params = scoreParams(context);
    expect(params.level.value).toBe(0);
    context.currentTime = 9;
    handle.setState({ intensity: 0, aurelianShare: .5, level: .6 });
    expect(params.culture.every(param => Math.abs(param.value - Math.SQRT1_2) < .00001)).toBe(true);
    expect(targetAt(params.level, 9)?.value).toBeCloseTo(SCORE_LEVEL * .6);
    context.currentTime = 11;
    handle.setState({ intensity: .3, aurelianShare: 1 });
    expect(params.culture.map(param => param.value)).toEqual([0, 1]);
    expect(targetAt(params.level, 11)?.value).toBe(SCORE_LEVEL);
    handle.stop();
  });

  it('applies latest pending state atomically on the bounded cadence', async () => {
    const { context, handle } = scoreHarness(); await handle.ready;
    context.currentTime = 10; handle.setState({ intensity: .2, aurelianShare: 0 });
    context.currentTime = 10.05; handle.setState({ intensity: .9, aurelianShare: 1 });
    context.currentTime = 10.1; handle.setState({ intensity: .7, aurelianShare: .5 });
    const params = scoreParams(context);
    expect([...params.intensity, ...params.culture].every(param => !param.targets.some(call => call.at > 10 && call.at < 10.13))).toBe(true);
    context.currentTime = 10.13; handle.setState({ intensity: .7, aurelianShare: null });
    expect(targetAt(params.intensity[1]!, 10.13)?.value).toBeCloseTo(rhythmLayerLevel(.7));
    expect(params.culture.every(param => Math.abs(param.value - Math.SQRT1_2) < .00001)).toBe(true);
    for (let tick = 0; tick < 2400; tick += 1) {
      context.currentTime = 20 + tick / 20;
      handle.setState({ intensity: tick % 2 ? .8 : .2, aurelianShare: null });
    }
    expect(params.intensity[1]!.targets.filter(call => call.at >= 20).length).toBeLessThanOrEqual(961);
    handle.stop();
  });

  it('starts with newest mix after delayed decoding', async () => {
    let deliver!: (value: ScoreBuffers) => void;
    const { context, handle } = delayedHarness(() => new Promise(resolve => { deliver = resolve; }));
    handle.setState({ intensity: .9, aurelianShare: 1, level: .4 });
    context.currentTime = 30;
    deliver(buffers(context as unknown as AudioContext));
    expect(await handle.ready).toBe(true);
    expect(context.sources.every(source => source.starts[0] === 30.025)).toBe(true);
    expect(scoreParams(context).culture.map(param => param.value)).toEqual([0, 1]);
    expect(scoreParams(context).level.value).toBeCloseTo(SCORE_LEVEL * .4);
    handle.stop();
  });

  it('can return to the pre-load state after a throttled update completed during decoding', async () => {
    let deliver!: (value: ScoreBuffers) => void;
    const { context, handle } = delayedHarness(() => new Promise(resolve => { deliver = resolve; }));
    context.currentTime = 10;
    handle.setState({ intensity: .2, aurelianShare: 0, level: .5 });
    context.currentTime = 10.05;
    handle.setState({ intensity: .9, aurelianShare: 1, level: .8 });
    deliver(buffers(context as unknown as AudioContext)); await handle.ready;
    context.currentTime = 11;
    handle.setState({ intensity: .2, aurelianShare: 0, level: .5 });
    expect(scoreParams(context).culture.map(param => param.value)).toEqual([1, 0]);
    expect(scoreParams(context).intensity[1]?.value).toBeCloseTo(rhythmLayerLevel(.2));
    expect(scoreParams(context).level.value).toBeCloseTo(SCORE_LEVEL * .5);
    handle.stop();
  });

  it('settles readiness when its context closes before decoding completes', async () => {
    let deliver!: (value: ScoreBuffers) => void;
    const { context, handle } = delayedHarness(() => new Promise(resolve => { deliver = resolve; }));
    await context.close();
    deliver(buffers(context as unknown as AudioContext));
    expect(await handle.ready).toBe(false);
    expect(context.sources.every(source => source.starts.length === 0 && source.connections.length === 0)).toBe(true);
    handle.stop();
  });

  it('cancels before decode without starting or stopping unstarted sources', async () => {
    let deliver!: (value: ScoreBuffers) => void;
    const { context, handle } = delayedHarness(() => new Promise(resolve => { deliver = resolve; }));
    handle.stop(); handle.stop();
    expect(await handle.ready).toBe(false);
    deliver(buffers(context as unknown as AudioContext)); await Promise.resolve();
    expect(context.sources.every(source => source.starts.length === 0 && source.stops.length === 0)).toBe(true);
    expect((context.sources as FakeBufferSource[]).every(source => source.buffer === null)).toBe(true);
  });

  it('retries loading once, then fails quietly without leaking connected nodes', async () => {
    vi.useFakeTimers();
    const loader = vi.fn<ScoreBufferLoader>().mockRejectedValue(new Error('network unavailable'));
    const { context, handle } = delayedHarness(loader);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await handle.ready).toBe(false);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(context.sources.every(source => source.starts.length === 0 && source.connections.length === 0)).toBe(true);
    handle.stop();
  });

  it('stops each started source once and releases PCM after the shutdown fade', async () => {
    vi.useFakeTimers();
    const { context, handle } = scoreHarness(); await handle.ready;
    context.currentTime = 23; handle.stop(); handle.stop();
    expect(context.sources.every(source => source.stops.length === 1 && source.stops[0] === 23.1)).toBe(true);
    await vi.advanceTimersByTimeAsync(SCORE_CLOSE_DELAY_MS);
    expect((context.sources as FakeBufferSource[]).every(source => source.buffer === null && source.connections.length === 0)).toBe(true);
  });
});
