import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import type { SimEvent } from '../sim/events';
import {
  lifecyclePlacement,
  preferredLifecycleEntity,
} from './audioCueRouting';

describe('lifecycle cue routing', () => {
  it('keeps safety and withdrawal reports on the console across large maps', () => {
    const inaudibleField = { level: 0, distance: 4_000 };
    expect(lifecyclePlacement('pilot_ejected', inaudibleField))
      .toEqual({ level: 0.12, distance: null });
    expect(lifecyclePlacement('unit_withdrew', inaudibleField))
      .toEqual({ level: 0.085, distance: null });
    expect(lifecyclePlacement('stood_up', inaudibleField)).toBe(inaudibleField);
  });

  it('prefers a player report over an earlier visible hostile in the same batch', () => {
    const world = playerWorld('audio-lifecycle-priority');
    const playerTeam = world.playerTeam ?? 0;
    const ally = world.entities.find((entity) => entity.team === playerTeam);
    const enemy = world.entities.find((entity) => entity.team !== playerTeam);
    if (ally === undefined || enemy === undefined || world.vision === null) {
      throw new Error('lifecycle routing test needs two teams and vision');
    }
    world.vision.visible.add(enemy.id);
    const events: SimEvent[] = [
      { type: 'pilot_ejected', tick: world.tick, entityId: enemy.id },
      { type: 'pilot_ejected', tick: world.tick, entityId: ally.id },
    ];
    expect(preferredLifecycleEntity(world, events, 'pilot_ejected')).toBe(ally.id);
  });

  it('does not select a hidden hostile lifecycle report', () => {
    const world = playerWorld('audio-lifecycle-hidden');
    const enemy = world.entities.find((entity) => entity.team !== (world.playerTeam ?? 0));
    if (enemy === undefined || world.vision === null) {
      throw new Error('lifecycle routing test needs a hidden hostile');
    }
    world.vision.visible.delete(enemy.id);
    expect(preferredLifecycleEntity(world, [
      { type: 'unit_withdrew', tick: world.tick, entityId: enemy.id, team: enemy.team },
    ], 'unit_withdrew')).toBeNull();
  });
});
