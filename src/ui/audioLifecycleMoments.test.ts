import { describe, expect, it } from 'vitest';
import type { VoiceBus, VoiceFrame } from './audioGraph';
import type { LifecycleMoment } from './audioCueRouting';
import { FakeContext, FakeGain, FakeOscillator } from './audioScoreGraphTestSupport';
import { playLifecycleMoment } from './audioVoices';

function voiceSignature(moment: LifecycleMoment): { pattern: string; tails: number[] } {
  const context = new FakeContext();
  const frame: VoiceFrame = {
    context: context as unknown as AudioContext,
    noise: {} as AudioBuffer,
    now: context.currentTime,
    out: new FakeGain() as unknown as GainNode,
    random: () => 0.25,
  };
  const bus: VoiceBus = { begin: () => frame };
  playLifecycleMoment(bus, moment, { level: 0.8, distance: 40 });
  const tails = context.sources.map((source) => (source.stops[0] ?? Number.NaN) - frame.now);
  return {
    pattern: JSON.stringify(context.sources.map((source) => ({
      kind: source instanceof FakeOscillator ? 'oscillator' : 'buffer',
      start: (source.starts[0] ?? Number.NaN) - frame.now,
      stop: (source.stops[0] ?? Number.NaN) - frame.now,
    }))),
    tails,
  };
}

describe('last lifecycle moment voices', () => {
  it('gives stand-up, ejection, and withdrawal distinct screen-off signatures', () => {
    const signatures = (['stood_up', 'pilot_ejected', 'unit_withdrew'] as const)
      .map((moment) => voiceSignature(moment).pattern);
    expect(new Set(signatures).size).toBe(3);
  });

  it('puts one finite stop on every source and keeps each tail under a second', () => {
    for (const moment of ['stood_up', 'pilot_ejected', 'unit_withdrew'] as const) {
      const { tails } = voiceSignature(moment);
      expect(tails.length, moment).toBeGreaterThan(0);
      expect(tails.every(Number.isFinite), moment).toBe(true);
      expect(Math.max(...tails), moment).toBeLessThan(1);
    }
  });
});
