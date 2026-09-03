import { afterEach, describe, expect, it, vi } from 'vitest';
import { playerWorld } from '../../tests/support';
import type { SimEvent } from '../sim/events';
import { AudioDirector } from './audio';
import {
  AudioGraph,
  FIELD_QUIET_VOICE_LIMIT,
  FIELD_VOICE_LIMIT,
  QUIET_MIX_GAIN,
  SCORE_DUCK_FLOOR,
  SCORE_DUCK_HOLD_SECONDS,
  TERMINAL_VOICE_RESERVE,
} from './audioGraph';
import { FakeContext, type FakeGain } from './audioScoreGraphTestSupport';

const FULL_SLOTS = FIELD_VOICE_LIMIT - TERMINAL_VOICE_RESERVE;

function bareGraph(): { context: FakeContext; graph: AudioGraph } {
  const context = new FakeContext();
  const graph = new AudioGraph(
    context as unknown as AudioContext,
    context.createGain(),
    {} as AudioBuffer,
  );
  return { context, graph };
}

function outGain(frame: ReturnType<AudioGraph['begin']>): number {
  if (frame === null) throw new Error('expected an admitted voice');
  return (frame.out as unknown as FakeGain).gain.value;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  FakeContext.instances.length = 0;
});

describe('quiet-mix admission', () => {
  it('admits the full slots at level, the overflow at the quiet mix, then refuses', () => {
    vi.spyOn(performance, 'now').mockReturnValue(250);
    const { graph } = bareGraph();
    const placement = { level: 0.8, distance: 20 };

    for (let i = 0; i < FULL_SLOTS; i += 1) {
      expect(outGain(graph.begin(placement))).toBeCloseTo(0.8);
    }
    for (let i = 0; i < FIELD_QUIET_VOICE_LIMIT; i += 1) {
      expect(outGain(graph.begin(placement))).toBeCloseTo(0.8 * QUIET_MIX_GAIN);
    }
    expect(graph.begin(placement)).toBeNull();
    for (let i = 0; i < TERMINAL_VOICE_RESERVE; i += 1) {
      expect(outGain(graph.begin(placement, 'terminal'))).toBeCloseTo(0.8);
    }
    expect(graph.begin(placement, 'terminal')).toBeNull();
    expect(outGain(graph.begin({ level: 0.5, distance: null }))).toBeCloseTo(0.5);
  });

  it('ducks the score bus under a blast and schedules its recovery', () => {
    const { context, graph } = bareGraph();
    graph.setLevel('score', 0.5);
    context.currentTime = 7;
    graph.duckScore();
    const targets = (graph.score as unknown as FakeGain).gain.targets;
    expect(targets.at(-2)).toMatchObject({ value: 0.5 * SCORE_DUCK_FLOOR, at: 7 });
    expect(targets.at(-1)).toMatchObject({ value: 0.5, at: 7 + SCORE_DUCK_HOLD_SECONDS });
    expect(targets.at(-1)?.timeConstant).toBeGreaterThan(0.3);
  });
});

describe('ranked field admission in the director', () => {
  it('hears the selected machine first even when its hit arrives last', () => {
    vi.spyOn(performance, 'now').mockReturnValue(250);
    vi.stubGlobal('AudioContext', FakeContext as unknown as typeof AudioContext);
    const world = playerWorld('audio-ranked-admission');
    const team = world.playerTeam ?? 0;
    const allies = world.entities.filter((entity) => entity.team === team);
    const enemy = world.entities.find((entity) => entity.team !== team);
    const selected = allies[0];
    const spotter = allies[1] ?? allies[0];
    if (selected === undefined || spotter === undefined || enemy === undefined || world.vision === null) {
      throw new Error('ranked admission test needs two teams and vision');
    }
    world.vision.visible.add(enemy.id);
    // Within earshot of the listener, but clearly farther than the hits on the enemy itself.
    selected.pos = { x: enemy.pos.x + 120, y: enemy.pos.y };

    const audio = new AudioDirector();
    audio.listenAt = enemy.pos;
    audio.selection = () => [selected.id];
    audio.unlock();
    const graph = (audio as unknown as { graph: AudioGraph }).graph;
    const begin = vi.spyOn(graph, 'begin');

    const onEnemy: SimEvent[] = Array.from({ length: FULL_SLOTS + 2 }, (_, i) => ({
      type: 'projectile_hit', tick: world.tick + i, shooterId: spotter.id, targetId: enemy.id,
      weaponId: 'medium_laser', location: 'centre_torso', damage: 5, arc: 'front',
    }));
    const onSelected: SimEvent = {
      type: 'projectile_hit', tick: world.tick, shooterId: enemy.id, targetId: selected.id,
      weaponId: 'medium_laser', location: 'centre_torso', damage: 5, arc: 'front',
    };
    audio.consume(world, [...onEnemy, onSelected]);

    const selectedDistance = Math.hypot(selected.pos.x - enemy.pos.x, selected.pos.y - enemy.pos.y);
    const fieldCalls = begin.mock.calls
      .map((call, index) => ({ placement: call[0], frame: begin.mock.results[index]?.value }))
      .filter((entry) => entry.placement.distance !== null);
    expect(fieldCalls[0]?.placement.distance).toBeCloseTo(selectedDistance);
    expect(outGain(fieldCalls[0]?.frame ?? null)).toBeCloseTo(fieldCalls[0]!.placement.level);
    const admitted = fieldCalls.filter((entry) => entry.frame !== null);
    expect(admitted).toHaveLength(FULL_SLOTS + 3);
    expect(outGain(admitted.at(-1)?.frame ?? null))
      .toBeCloseTo(admitted.at(-1)!.placement.level * QUIET_MIX_GAIN);
    audio.destroy();
  });
});
