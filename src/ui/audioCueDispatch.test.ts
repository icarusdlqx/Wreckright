import { afterEach, describe, expect, it, vi } from 'vitest';
import { playerWorld } from '../../tests/support';
import type { SimEvent } from '../sim/events';
import type { MechEntity, World } from '../sim/types';
import type { AudioGraph } from './audioGraph';

const harm = vi.hoisted(() => ({
  whizz: vi.fn(), tear: vi.fn(), stagger: vi.fn(), injury: vi.fn(),
}));
const support = vi.hoisted(() => ({ acknowledged: vi.fn(), ground: vi.fn(), resolution: vi.fn() }));
const voices = vi.hoisted(() => ({ end: vi.fn() }));

vi.mock('./audioHarmVoices', () => ({
  playWhizz: harm.whizz,
  playTear: harm.tear,
  playStagger: harm.stagger,
  playPilotInjury: harm.injury,
}));
vi.mock('./audioSupport', async (importOriginal) => ({
  ...await importOriginal<typeof import('./audioSupport')>(),
  playSupportAcknowledged: support.acknowledged,
  playGroundImpact: support.ground,
  playSupportResolution: support.resolution,
}));
vi.mock('./audioVoices', async (importOriginal) => ({
  ...await importOriginal<typeof import('./audioVoices')>(),
  playBattleEnd: voices.end,
}));

import { AudioDirector } from './audio';

interface Harness {
  audio: AudioDirector;
  graph: { duckScore: ReturnType<typeof vi.fn>; begin: ReturnType<typeof vi.fn> };
  world: World;
  ally: MechEntity;
  enemy: MechEntity;
  team: number;
}

function harness(seed: string): Harness {
  const world = playerWorld(seed);
  const team = world.playerTeam ?? 0;
  const ally = world.entities.find((entity) => entity.team === team);
  const enemy = world.entities.find((entity) => entity.team !== team);
  if (ally === undefined || enemy === undefined || world.vision === null) {
    throw new Error('cue dispatch test needs two teams and vision');
  }
  world.vision.visible.add(enemy.id);
  const graph = { duckScore: vi.fn(), begin: vi.fn(() => null), close: vi.fn() };
  const audio = new AudioDirector();
  (audio as unknown as { graph: AudioGraph }).graph = graph as unknown as AudioGraph;
  audio.listenAt = ally.pos;
  return { audio, graph, world, ally, enemy, team };
}

afterEach(() => {
  for (const mock of [...Object.values(harm), ...Object.values(support), ...Object.values(voices)]) {
    mock.mockReset();
  }
});

describe('new cue routing', () => {
  it('coalesces a missed volley into one reduced-level whizz behind the hits', () => {
    const { audio, world, ally, enemy } = harness('cue-miss');
    const miss: SimEvent = {
      type: 'projectile_miss', tick: world.tick, shooterId: enemy.id, targetId: ally.id, weaponId: 'lrm20',
    };
    audio.consume(world, [miss, miss, miss]);
    expect(harm.whizz).toHaveBeenCalledOnce();
    expect(harm.whizz.mock.calls[0]?.[1]).toBe(3);
    expect(harm.whizz.mock.calls[0]?.[2]).toEqual({ level: 0.4, distance: 0 });
    audio.destroy();
  });

  it('tears a lost section, stumbles a stagger, and reports a wounded pilot to the console', () => {
    const { audio, world, ally, enemy } = harness('cue-harm');
    audio.consume(world, [
      { type: 'location_destroyed', tick: world.tick, entityId: ally.id, location: 'left_arm' },
      { type: 'staggered', tick: world.tick, entityId: enemy.id },
      { type: 'pilot_injured', tick: world.tick, entityId: ally.id, wounds: 1 },
      { type: 'pilot_injured', tick: world.tick, entityId: enemy.id, wounds: 1 },
    ]);
    expect(harm.tear).toHaveBeenCalledOnce();
    expect(harm.stagger).toHaveBeenCalledOnce();
    expect(harm.injury).toHaveBeenCalledTimes(2);
    const placements = harm.injury.mock.calls.map((call) => call[1] as { distance: number | null });
    expect(placements.some((placement) => placement.distance === null)).toBe(true);
    expect(placements.some((placement) => placement.distance !== null)).toBe(true);
    audio.destroy();
  });

  it('acknowledges only the player call and lands every shell', () => {
    const { audio, world, team } = harness('cue-support');
    audio.consume(world, [
      { type: 'support_called', tick: world.tick, team, call: 'artillery_strike', x: 1, y: 1, cost: 2 },
      { type: 'support_called', tick: world.tick, team, call: 'minelayer', x: 1, y: 1, cost: 2 },
      { type: 'support_called', tick: world.tick, team: 1 - team, call: 'air_strike', x: 1, y: 1, cost: 2 },
      { type: 'support_resolved', tick: world.tick, team, call: 'artillery_strike', x: 1, y: 1 },
      { type: 'ground_impact', tick: world.tick, kind: 'artillery', team, x: 1, y: 1 },
      { type: 'ground_impact', tick: world.tick, kind: 'artillery', team: 1 - team, x: 2, y: 2 },
    ]);
    expect(support.acknowledged).toHaveBeenCalledOnce();
    expect(support.resolution).toHaveBeenCalledOnce();
    expect(support.resolution.mock.calls[0]?.[1]).toBe('artillery_strike');
    expect(support.ground).toHaveBeenCalledTimes(2);

    support.acknowledged.mockReset();
    audio.consume(world, [
      { type: 'support_called', tick: world.tick, team: 1 - team, call: 'air_strike', x: 1, y: 1, cost: 2 },
    ]);
    expect(support.acknowledged).not.toHaveBeenCalled();
    audio.destroy();
  });

  it('stings the end of the battle once, preferring the mission verdict', () => {
    const { audio, world, team } = harness('cue-end');
    audio.consume(world, [
      { type: 'battle_ended', tick: world.tick, winner: 1 - team },
      { type: 'mission_ended', tick: world.tick, status: 'success', reason: 'held' },
    ]);
    audio.consume(world, [{ type: 'battle_ended', tick: world.tick + 1, winner: team }]);
    expect(voices.end).toHaveBeenCalledOnce();
    expect(voices.end.mock.calls[0]?.[1]).toBe('success');
    audio.destroy();

    const draw = harness('cue-end-draw');
    draw.audio.consume(draw.world, [{ type: 'battle_ended', tick: draw.world.tick, winner: null }]);
    const loss = harness('cue-end-loss');
    loss.audio.consume(loss.world, [{ type: 'battle_ended', tick: loss.world.tick, winner: 1 - loss.team }]);
    expect(voices.end.mock.calls.map((call) => call[1])).toEqual(['success', 'draw', 'failure']);
    draw.audio.destroy();
    loss.audio.destroy();
  });

  it('ducks the score once per batch of blasts and not for ordinary fire', () => {
    const { audio, graph, world, ally, enemy } = harness('cue-duck');
    audio.consume(world, [
      { type: 'ammo_explosion', tick: world.tick, entityId: ally.id, location: 'left_torso', damage: 20 },
      { type: 'mech_destroyed', tick: world.tick, entityId: enemy.id, method: 'centre_torso' },
    ]);
    expect(graph.duckScore).toHaveBeenCalledOnce();
    audio.consume(world, [
      { type: 'projectile_hit', tick: world.tick + 1, shooterId: enemy.id, targetId: ally.id,
        weaponId: 'medium_laser', location: 'centre_torso', damage: 5, arc: 'front' },
    ]);
    expect(graph.duckScore).toHaveBeenCalledOnce();
    audio.destroy();
  });
});
