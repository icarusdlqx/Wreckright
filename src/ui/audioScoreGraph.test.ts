import { afterEach, describe, expect, it } from 'vitest';
import {
  SCORE_FILTER_COUNT,
  SCORE_GAIN_COUNT,
  SCORE_NODE_COUNT,
  SCORE_RETARGET_INTERVAL_SECONDS,
  SCORE_SOURCE_COUNT,
  fullLayerLevel,
} from './audioScoreGraph';
import {
  callsAt,
  FakeContext,
  FakeOscillator,
  type FakeParam,
  scoreHarness,
  scoreParams,
  targetAt,
} from './audioScoreGraphTestSupport';
import { SCORE_CULTURE_VOICINGS, scoreVoicingAt } from './audioScoreVoicing';

function expectAutomation(param: FakeParam, at: number, seconds: number): void {
  const calls = callsAt(param, at);
  expect(calls.map((call) => call.method)).toEqual(['cancel', 'target']);
  const target = calls[1];
  expect(target?.method).toBe('target');
  if (target?.method === 'target') expect(target.timeConstant).toBeCloseTo(seconds, 8);
}

function expectIntensityTiming(
  context: FakeContext,
  at: number,
  layerSeconds: number,
  fullSeconds: number,
): void {
  const { intensity, full } = scoreParams(context);
  for (const param of intensity) {
    expectAutomation(param, at, param === full ? fullSeconds : layerSeconds);
  }
}

function expectCultureTargets(
  context: FakeContext,
  at: number,
  share: number,
  seconds: number,
): void {
  const expected = scoreVoicingAt(share);
  const values = [
    expected.rootHz, expected.fifthHz, expected.pulseHz, expected.fullHz,
    expected.rootLevel, expected.fifthLevel, expected.pulseLevel,
    expected.droneCutoffHz, expected.droneQ,
    expected.pulseCutoffHz, expected.pulseQ,
    expected.fullCutoffHz, expected.fullQ,
  ];
  const params = scoreParams(context).culture;
  expect(params).toHaveLength(13);
  params.forEach((param, index) => {
    expectAutomation(param, at, seconds);
    expect(targetAt(param, at)?.value).toBeCloseTo(values[index] ?? Number.NaN, 8);
  });
}

afterEach(() => {
  FakeContext.instances.length = 0;
});

describe('fixed procedural score graph', () => {
  it('initialises the exact five-source graph at either culture endpoint', () => {
    for (const [share, voice] of [
      [0, SCORE_CULTURE_VOICINGS.linewrought],
      [1, SCORE_CULTURE_VOICINGS.aurelian],
    ] as const) {
      const { context, handle } = scoreHarness(share);
      const sources = context.sources as FakeOscillator[];
      expect(sources).toHaveLength(SCORE_SOURCE_COUNT);
      expect(context.gains).toHaveLength(SCORE_GAIN_COUNT);
      expect(context.filters).toHaveLength(SCORE_FILTER_COUNT);
      expect(context.sources.length + context.gains.length + context.filters.length)
        .toBe(SCORE_NODE_COUNT);
      expect(sources.map((source) => source.type))
        .toEqual(['triangle', 'sine', 'triangle', 'sine', 'sawtooth']);
      expect(sources.map((source) => source.frequency.value)).toEqual([
        voice.rootHz, voice.fifthHz, voice.pulseHz, 0.72, voice.fullHz,
      ]);
      expect(context.filters.map((filter) => [filter.frequency.value, filter.Q.value])).toEqual([
        [voice.droneCutoffHz, voice.droneQ],
        [voice.pulseCutoffHz, voice.pulseQ],
        [voice.fullCutoffHz, voice.fullQ],
      ]);
      expect([
        context.gains[2]?.gain.value,
        context.gains[3]?.gain.value,
        context.gains[6]?.gain.value,
      ]).toEqual([voice.rootLevel, voice.fifthLevel, voice.pulseLevel]);
      expect(sources.every((source) => source.starts.length === 1)).toBe(true);
      handle.stop();
    }
  });

  it('never allocates another score node while pressure and culture change', () => {
    const { context, handle } = scoreHarness();
    const counts = [context.sources.length, context.gains.length, context.filters.length];
    for (let step = 0; step < 1_000; step += 1) {
      context.currentTime = 10 + step * 0.13;
      handle.setState(
        { intensity: (step % 11) / 10, aurelianShare: (step % 7) / 6 },
        step % 3 === 0 ? 4 : 1,
      );
    }
    expect([context.sources.length, context.gains.length, context.filters.length]).toEqual(counts);
    expect(context.sources.every((source) => source.starts.length === 1)).toBe(true);
  });

  it('keeps the full layer monotonic, bounded, and silent below commitment', () => {
    expect(fullLayerLevel(-1)).toBe(0);
    expect(fullLayerLevel(Number.NaN)).toBe(0);
    expect(fullLayerLevel(0.46)).toBe(0);
    const t = (0.6 - 0.46) / (0.74 - 0.46);
    const smooth = t * t * (3 - 2 * t);
    expect(fullLayerLevel(0.6)).toBeCloseTo(smooth * (0.035 + 0.075 * 0.6), 10);
    expect(fullLayerLevel(1)).toBeCloseTo(0.11, 10);
    const levels = Array.from({ length: 101 }, (_, index) => fullLayerLevel(index / 100));
    expect(levels.every((level) => level >= 0 && level <= 0.11)).toBe(true);
    expect(levels.every((level, index) => index === 0 || level >= levels[index - 1]!)).toBe(true);
  });

  it('uses independent attack and release smoothing with speed scaling', () => {
    const { context, handle } = scoreHarness();
    context.currentTime = 12.75;
    handle.setState({ intensity: 0.8, aurelianShare: 0 });
    expectIntensityTiming(context, 12.75, 0.6, 0.35);

    context.currentTime = 17.25;
    handle.setState({ intensity: 0.1, aurelianShare: 0 });
    expectIntensityTiming(context, 17.25, 1.6, 2.2);

    context.currentTime = 21.5;
    handle.setState({ intensity: 0.9, aurelianShare: 0 }, 4);
    expectIntensityTiming(context, 21.5, 0.6 / 4, 0.35 / 4);

    context.currentTime = 24.75;
    handle.setState({ intensity: 0.05, aurelianShare: 0 }, 4);
    expectIntensityTiming(context, 24.75, 1.6 / 4, 2.2 / 4);
  });

  it('morphs pitch and filters geometrically and levels and Q linearly', () => {
    const { context, handle } = scoreHarness();
    context.currentTime = 8;
    handle.setState({ intensity: 0, aurelianShare: 0.5 });
    expectCultureTargets(context, 8, 0.5, 0.75);

    context.currentTime = 10;
    handle.setState({ intensity: 0, aurelianShare: 1 }, 4);
    expectCultureTargets(context, 10, 1, 0.75 / 4);
  });

  it('applies the last pending state atomically on the shared 125 ms cadence', () => {
    const { context, handle } = scoreHarness();
    context.currentTime = 10;
    handle.setState({ intensity: 0.2, aurelianShare: 0 });
    context.currentTime = 10.05;
    handle.setState({ intensity: 0.9, aurelianShare: 1 });
    context.currentTime = 10.1;
    handle.setState({ intensity: 0.7, aurelianShare: 0.5 });
    const params = scoreParams(context);
    expect([...params.intensity, ...params.culture].every(
      (param) => callsAt(param, 10.05).length + callsAt(param, 10.1).length === 0,
    )).toBe(true);

    context.currentTime = 10.13;
    handle.setState({ intensity: 0.7, aurelianShare: null });
    const all = [...params.intensity, ...params.culture];
    expect(new Set(all)).toHaveLength(17);
    expect(all.every((param) => callsAt(param, 10.13).length === 2)).toBe(true);
    expect(targetAt(params.full, 10.13)?.value).toBeCloseTo(fullLayerLevel(0.7), 8);
    expect(targetAt(params.culture[0]!, 10.13)?.value)
      .toBeCloseTo(scoreVoicingAt(0.5).rootHz, 8);
  });

  it('bounds a long 20 Hz stream by the retarget cadence', () => {
    const { context, handle } = scoreHarness();
    const start = 10;
    const seconds = 120;
    for (let tick = 0; tick < seconds * 20; tick += 1) {
      context.currentTime = start + tick / 20;
      handle.setState({ intensity: tick % 2 === 0 ? 0.18 : 0.82, aurelianShare: null });
    }
    const times = new Set(
      scoreParams(context).intensity[0]?.targets
        .filter((target) => target.at >= start)
        .map((target) => target.at),
    );
    expect(times.size).toBeGreaterThan(1);
    expect(times.size).toBeLessThanOrEqual(
      Math.ceil(seconds / SCORE_RETARGET_INTERVAL_SECONDS) + 1,
    );
  });

  it('retains culture on null updates and stops every source exactly once', () => {
    const { context, handle } = scoreHarness(0.25);
    context.currentTime = 10;
    handle.setState({ intensity: 0, aurelianShare: 1 });
    context.currentTime = 11;
    handle.setState({ intensity: 0.7, aurelianShare: null });
    expect(scoreParams(context).culture.every((param) => callsAt(param, 11).length === 0)).toBe(true);
    context.currentTime = 23;
    handle.stop();
    handle.stop();
    expect(context.sources.every((source) => source.stops.length === 1)).toBe(true);
    expect(context.sources.every((source) => Number.isFinite(source.stops[0]))).toBe(true);
  });
});
