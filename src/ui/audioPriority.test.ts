import { afterEach, describe, expect, it, vi } from 'vitest';
import { playerWorld } from '../../tests/support';
import { machineCulture } from '../render3d/machineCulture';
import type { SimEvent } from '../sim/events';
import type { MechEntity, World } from '../sim/types';
import { AudioDirector } from './audio';
import {
  AudioGraph,
  FIELD_VOICE_LIMIT,
  TERMINAL_VOICE_RESERVE,
} from './audioGraph';

class FakeParam {
  value = 0;

  setValueAtTime(value: number): void {
    this.value = value;
  }

  exponentialRampToValueAtTime(value: number): void {
    this.value = value;
  }

  setTargetAtTime(value: number): void {
    this.value = value;
  }
}

class FakeNode {
  connect<T>(destination: T): T {
    return destination;
  }
}

class FakeSource extends FakeNode {
  readonly starts: number[] = [];
  readonly stops: number[] = [];
  buffer: AudioBuffer | null = null;
  loop = false;
  type: OscillatorType = 'sine';
  readonly frequency = new FakeParam();

  start(when = 0): void {
    this.starts.push(when);
  }

  stop(when = 0): void {
    this.stops.push(when);
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakeFilter extends FakeNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
}

class FakeContext {
  readonly currentTime = 5;
  readonly sources: FakeSource[] = [];
  state: AudioContextState = 'running';

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  createOscillator(): OscillatorNode {
    const source = new FakeSource();
    this.sources.push(source);
    return source as unknown as OscillatorNode;
  }

  createGain(): GainNode {
    return new FakeGain() as unknown as GainNode;
  }

  createBiquadFilter(): BiquadFilterNode {
    return new FakeFilter() as unknown as BiquadFilterNode;
  }

  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }
}

interface SaturatedAudio {
  audio: AudioDirector;
  context: FakeContext;
  graph: AudioGraph;
  world: World;
  target: MechEntity;
  events: SimEvent[];
}

function saturatedAudio(seed: string): SaturatedAudio {
  const context = new FakeContext();
  const graph = new AudioGraph(
    context as unknown as AudioContext,
    context.createGain(),
    {} as AudioBuffer,
  );
  const audio = new AudioDirector();
  (audio as unknown as { graph: AudioGraph }).graph = graph;

  const world = playerWorld(seed);
  const target = world.entities.find((entity) => entity.team === (world.playerTeam ?? 0));
  const shooter = world.entities.find((entity) => entity.team !== (world.playerTeam ?? 0));
  if (target === undefined || shooter === undefined) throw new Error('audio test needs two teams');
  audio.listenAt = target.pos;

  const hit: SimEvent = {
    type: 'projectile_hit',
    tick: world.tick,
    shooterId: shooter.id,
    targetId: target.id,
    weaponId: 'medium_laser',
    location: 'centre_torso',
    damage: 5,
    arc: 'front',
  };
  const events: SimEvent[] = Array.from({ length: 1_000 }, () => ({ ...hit }));
  events.push({
    type: 'mech_destroyed',
    tick: world.tick,
    entityId: target.id,
    method: 'centre_torso',
  });
  return { audio, context, graph, world, target, events };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('terminal voice priority', () => {
  it('keeps the reserve across consumes in one rolling field window', () => {
    vi.spyOn(performance, 'now').mockReturnValue(250);
    const harness = saturatedAudio('terminal-priority-window');
    const begin = vi.spyOn(harness.graph, 'begin');
    const terminal = harness.events.at(-1);
    if (terminal === undefined) throw new Error('audio test needs a terminal event');

    harness.audio.consume(harness.world, harness.events.slice(0, -1));
    harness.audio.consume(harness.world, [terminal]);

    const admittedOrdinary = begin.mock.calls.filter((call, index) =>
      call[1] !== 'terminal' && begin.mock.results[index]?.value !== null,
    );
    const admittedTerminal = begin.mock.calls.filter((call, index) =>
      call[1] === 'terminal' && begin.mock.results[index]?.value !== null,
    );
    expect(admittedOrdinary).toHaveLength(FIELD_VOICE_LIMIT - TERMINAL_VOICE_RESERVE);
    expect(admittedTerminal).toHaveLength(TERMINAL_VOICE_RESERVE);
    expect(harness.context.sources.every((source) => Number.isFinite(source.stops[0]))).toBe(true);
    harness.audio.destroy();
  });

  it('reserves destruction and collapse after a thousand earlier hits at 4x', () => {
    vi.spyOn(performance, 'now').mockReturnValue(250);
    const harness = saturatedAudio('terminal-priority-speed');
    const begin = vi.spyOn(harness.graph, 'begin');

    harness.audio.consume(harness.world, harness.events, 4);

    const admitted = begin.mock.results.map((result) => result.value !== null);
    const ordinary = begin.mock.calls.filter((call, index) =>
      call[1] !== 'terminal' && admitted[index],
    );
    const terminal = begin.mock.calls.filter((call, index) =>
      call[1] === 'terminal' && admitted[index],
    );
    expect(ordinary).toHaveLength(FIELD_VOICE_LIMIT - TERMINAL_VOICE_RESERVE);
    expect(terminal).toHaveLength(TERMINAL_VOICE_RESERVE);

    const faction = harness.world.catalog.chassis.get(harness.target.chassisId)?.faction
      ?? 'linewrought';
    const delayed = harness.context.sources
      .flatMap((source) => source.starts)
      .filter((start) => start > harness.context.currentTime);
    expect(delayed).toHaveLength(3);
    expect(delayed[0]! - harness.context.currentTime)
      .toBeCloseTo(machineCulture(faction).terminalFallSeconds / 4);
    expect(harness.context.sources.every((source) => source.stops.length === 1)).toBe(true);
    expect(harness.context.sources.every((source) => Number.isFinite(source.stops[0]))).toBe(true);
    expect(harness.context.sources.length).toBeLessThanOrEqual(
      FIELD_VOICE_LIMIT * 4,
    );
    harness.audio.destroy();
  });

  it('keeps a saturated reduced-motion terminal landing immediate', () => {
    vi.spyOn(performance, 'now').mockReturnValue(250);
    const harness = saturatedAudio('terminal-priority-reduced');
    const begin = vi.spyOn(harness.graph, 'begin');

    harness.audio.consume(harness.world, harness.events, 4, true);

    const admittedTerminal = begin.mock.calls.filter((call, index) =>
      call[1] === 'terminal' && begin.mock.results[index]?.value !== null,
    );
    expect(admittedTerminal).toHaveLength(TERMINAL_VOICE_RESERVE);
    expect(harness.context.sources.flatMap((source) => source.starts))
      .toEqual(expect.arrayContaining([harness.context.currentTime]));
    expect(harness.context.sources.every(
      (source) => source.starts.every((start) => start === harness.context.currentTime),
    )).toBe(true);
    harness.audio.destroy();
  });
});
