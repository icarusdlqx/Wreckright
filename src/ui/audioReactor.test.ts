import { afterEach, describe, expect, it, vi } from 'vitest';
import { playerWorld } from '../../tests/support';
import { AudioDirector } from './audio';
import type { AmbientBus } from './audioGraph';
import { REACTOR_STRESS_SOURCE_COUNT, startReactorStress } from './audioReactor';
import { SCORE_SOURCE_COUNT } from './audioScore';
import { FakeContext, FakeGain } from './audioScoreGraphTestSupport';

function fakeBus(): { context: FakeContext; bus: AmbientBus } {
  const context = new FakeContext();
  return {
    context,
    bus: {
      context: context as unknown as AudioContext,
      master: new FakeGain() as unknown as GainNode,
      noise: {} as AudioBuffer,
      random: () => 0.25,
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeContext.instances.length = 0;
});

describe('reactor stress loop', () => {
  it('idles silent, follows the tier, and stops every source once', () => {
    const { context, bus } = fakeBus();
    const handle = startReactorStress(bus);
    expect(context.sources).toHaveLength(REACTOR_STRESS_SOURCE_COUNT);
    expect(context.sources.every((source) => source.starts.length === 1)).toBe(true);
    const level = context.gains[0]!;
    expect(level.gain.value).toBe(0);

    handle.setTier(2);
    expect(level.gain.targets.at(-1)?.value).toBeGreaterThan(0);
    const tierTwo = level.gain.targets.at(-1)?.value ?? 0;
    handle.setTier(3);
    expect(level.gain.targets.at(-1)?.value).toBeGreaterThan(tierTwo);
    handle.setTier(0);
    expect(level.gain.targets.at(-1)?.value).toBe(0);

    handle.stop();
    handle.stop();
    expect(context.sources.every((source) => source.stops.length === 1)).toBe(true);
  });

  it('runs once for the selected hot machine and never allocates again', () => {
    vi.stubGlobal('AudioContext', FakeContext as unknown as typeof AudioContext);
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    const world = playerWorld('audio-reactor-stress');
    const ally = world.entities.find((entity) => entity.team === (world.playerTeam ?? 0));
    if (ally === undefined) throw new Error('reactor test needs a player machine');
    const audio = new AudioDirector();
    audio.unlock();
    const context = FakeContext.instances[0]!;
    const looping = (): number => context.sources.filter((source) => source.stops.length === 0).length;

    ally.heat = ally.heatCapacity * 0.85;
    audio.consume(world, []);
    expect(looping()).toBe(SCORE_SOURCE_COUNT);

    audio.selection = () => [ally.id];
    audio.consume(world, []);
    expect(looping()).toBe(SCORE_SOURCE_COUNT + REACTOR_STRESS_SOURCE_COUNT);
    audio.consume(world, []);
    audio.selection = () => [];
    audio.consume(world, []);
    audio.selection = () => [ally.id];
    audio.consume(world, []);
    expect(looping()).toBe(SCORE_SOURCE_COUNT + REACTOR_STRESS_SOURCE_COUNT);

    audio.destroy();
    expect(context.sources.every((source) => source.stops.length === 1)).toBe(true);
  });
});
