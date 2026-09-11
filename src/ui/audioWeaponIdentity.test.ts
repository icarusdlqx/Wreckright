import { describe, expect, it, vi } from 'vitest';
import type { Faction } from '../schema/faction';
import { FakeContext, FakeOscillator, FakeParam } from './audioScoreGraphTestSupport';
import type { VoiceBus, VoiceFrame } from './audioGraph';
import { playImpact, playWeapon } from './audioWeapons';

const styles = ['tracer', 'missile', 'slug', 'beam', 'pulse', 'bolt', 'flame'];
const placement = { level: 0.8, distance: 40, pan: -0.65 };

function harness() {
  const context = new FakeContext();
  const frame: VoiceFrame = { context: context as unknown as AudioContext, now: context.currentTime,
    noise: {} as AudioBuffer, out: context.createGain(), random: () => 0.25 };
  const bus = { begin: vi.fn<VoiceBus['begin']>(() => frame) };
  return { context, bus };
}

function voice(faction: Faction, style: string, count = 6) {
  const result = harness();
  const automation = vi.spyOn(FakeParam.prototype, 'setValueAtTime');
  playWeapon(result.bus, faction, style, count, placement);
  const starts = automation.mock.calls.map(call => call[0]);
  automation.mockRestore();
  return { ...result, starts };
}

function signature({ context, starts }: ReturnType<typeof voice>): string {
  return JSON.stringify({
    starts,
    sources: context.sources.map(source => ({ kind: source instanceof FakeOscillator ? source.type : 'noise',
      start: source.starts[0], stop: source.stops[0], frequency: source instanceof FakeOscillator ? source.frequency.value : null })),
    filters: context.filters.map(filter => [filter.type, filter.frequency.value, filter.Q.value]),
  });
}

describe('weapon family identity and bounded salvos', () => {
  it.each(['linewrought', 'aurelian'] as const)('keeps all seven weapon families distinct for %s', faction => {
    expect(new Set(styles.map(style => signature(voice(faction, style)))).size).toBe(styles.length);
  });

  it('keeps the faction mechanism audible inside each weapon family', () => {
    for (const style of styles) expect(signature(voice('aurelian', style)), style)
      .not.toBe(signature(voice('linewrought', style)));
  });

  it('does not turn Aurelian rocket exhaust or ballistic volleys into a single energy shot', () => {
    for (const faction of ['linewrought', 'aurelian'] as const) {
      expect(voice(faction, 'missile', 6).context.sources.length).toBeGreaterThan(voice(faction, 'missile', 1).context.sources.length);
      expect(voice(faction, 'tracer', 10).context.sources.length).toBeGreaterThan(voice(faction, 'tracer', 1).context.sources.length);
      expect(voice(faction, 'missile').context.filters.some(filter => filter.type === 'bandpass' && filter.frequency.value === 2_900)).toBe(true);
    }
  });

  it('admits once, starts immediately, and stops every source inside one second even for oversized or invalid counts', () => {
    for (const faction of ['linewrought', 'aurelian'] as const) for (const style of styles) {
      for (const count of [1, 10_000, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
        const { context, bus } = voice(faction, style, count);
        expect(bus.begin).toHaveBeenCalledExactlyOnceWith({ ...placement, level: placement.level * 0.88 });
        expect(context.sources.length).toBeLessThanOrEqual(17);
        expect(context.sources.some(source => source.starts[0] === context.currentTime)).toBe(true);
        for (const source of context.sources) {
          expect(source.stops).toHaveLength(1);
          expect(source.stops[0]).toBeGreaterThan(source.starts[0]!);
          expect(source.stops[0]).toBeLessThan(context.currentTime + 1);
        }
      }
    }
  });

  it('allocates nothing when admission is refused', () => {
    const { context, bus } = harness();
    bus.begin.mockReturnValue(null);
    for (const style of styles) playWeapon(bus, 'aurelian', style, 50, placement);
    expect(context.sources).toHaveLength(0);
  });

  it('preserves the camera-relative pan when softening an impact', () => {
    const { bus } = harness();
    playImpact(bus, { type: 'ballistic', style: 'tracer', damage: 8 }, placement);
    expect(bus.begin).toHaveBeenCalledWith({ ...placement, level: placement.level * 0.7 });
  });
});
