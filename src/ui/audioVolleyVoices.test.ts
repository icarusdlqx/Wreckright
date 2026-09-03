import { describe, expect, it } from 'vitest';
import type { VoiceBus, VoiceFrame } from './audioGraph';
import { playPilotInjury, playStagger, playTear, playWhizz } from './audioHarmVoices';
import { FakeContext, FakeGain, FakeOscillator } from './audioScoreGraphTestSupport';
import { playBattleEnd } from './audioVoices';
import { playCrunch, playImpact } from './audioWeapons';

function voiced(play: (bus: VoiceBus) => void): { context: FakeContext; pattern: string } {
  const context = new FakeContext();
  const frame: VoiceFrame = {
    context: context as unknown as AudioContext,
    noise: {} as AudioBuffer,
    now: context.currentTime,
    out: new FakeGain() as unknown as GainNode,
    random: () => 0.25,
  };
  play({ begin: () => frame });
  return {
    context,
    pattern: JSON.stringify(context.sources.map((source) => [
      source instanceof FakeOscillator ? 'oscillator' : 'buffer',
      (source.starts[0] ?? Number.NaN) - frame.now,
      (source.stops[0] ?? Number.NaN) - frame.now,
    ])),
  };
}

const field = { level: 0.8, distance: 40 };

describe('volley and harm voices', () => {
  it('gives every new field voice a distinct, finite signature', () => {
    const voicesUnderTest = {
      whizz: voiced((bus) => playWhizz(bus, 1, field)),
      ricochet: voiced((bus) => playWhizz(bus, 3, field)),
      tear: voiced((bus) => playTear(bus, field)),
      crunch: voiced((bus) => playCrunch(bus, field)),
      stagger: voiced((bus) => playStagger(bus, field)),
      injury: voiced((bus) => playPilotInjury(bus, field)),
      success: voiced((bus) => playBattleEnd(bus, 'success')),
      failure: voiced((bus) => playBattleEnd(bus, 'failure')),
      draw: voiced((bus) => playBattleEnd(bus, 'draw')),
    };
    const patterns = Object.values(voicesUnderTest).map((voice) => voice.pattern);
    expect(new Set(patterns).size).toBe(patterns.length);
    for (const [name, voice] of Object.entries(voicesUnderTest)) {
      expect(voice.context.sources.length, name).toBeGreaterThan(0);
      expect(voice.context.sources.every((source) => source.stops.length === 1), name).toBe(true);
      expect(voice.context.sources.every((source) => Number.isFinite(source.stops[0])), name).toBe(true);
    }
    expect(voicesUnderTest.ricochet.context.sources.length)
      .toBeGreaterThan(voicesUnderTest.whizz.context.sources.length);
  });

  it('patters a coalesced volley without changing the single-round impact', () => {
    const profile = { type: 'ballistic', style: 'tracer', damage: 8 } as const;
    const single = voiced((bus) => playImpact(bus, profile, field));
    const legacy = voiced((bus) => playImpact(bus, { ...profile }, field));
    const volley = voiced((bus) => playImpact(bus, { ...profile, count: 6 }, field));
    expect(legacy.pattern).toBe(single.pattern);
    expect(volley.context.sources.length).toBe(single.context.sources.length + 3);
    expect(volley.context.sources.every((source) => Number.isFinite(source.stops[0]))).toBe(true);
  });
});
