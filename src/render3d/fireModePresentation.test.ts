import { Color, Scene } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { playerWorld, testWorld } from '../../tests/support';
import type { SimEvent } from '../sim/events';
import { BattleEffects } from './battleEffects';
import { TacticalCamera } from './camera';
import { MuzzleFlashPool } from './muzzleFlashPool';
import { TracerLayer } from './tracers';

type Fired = Extract<SimEvent, { type: 'weapon_fired' }>;

function event(modeId: 'cluster' | 'slug', shooterId = 1, targetId = 2): Fired {
  return {
    type: 'weapon_fired',
    tick: 1,
    shooterId,
    targetId,
    weaponId: 'lbx_ac10',
    modeId,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fire-mode battle presentation', () => {
  it('uses the fired LB-X mode for outgoing tracers and muzzle light', () => {
    const fire = vi.spyOn(TracerLayer.prototype, 'fire').mockImplementation(() => undefined);
    const flash = vi.spyOn(MuzzleFlashPool.prototype, 'trigger')
      .mockImplementation(() => undefined);
    const feedback = new BattleEffects(
      new Scene(),
      new Color(0x1a2024),
      new TacticalCamera(false),
      () => 0,
      (id) => id === 1 ? { x: 0, y: 0 } : { x: 100, y: 0 },
      () => false,
    );

    feedback.consume(testWorld('fire-mode-outgoing'), [event('cluster'), event('slug')]);

    expect(fire.mock.calls.map((call) => ({
      style: call[2].style,
      projectiles: call[3],
      velocity: call[4],
    }))).toEqual([
      { style: 'tracer', projectiles: 10, velocity: 600 },
      { style: 'tracer', projectiles: 1, velocity: 600 },
    ]);
    expect(flash.mock.calls.map((call) => call[2])).toEqual([1.2, 13.2]);
    feedback.destroy();
  });

  it('uses the fired LB-X mode for target-side cues without locating the shooter', () => {
    const world = playerWorld('fire-mode-incoming');
    const ally = world.entities.find((candidate) => candidate.team === world.playerTeam);
    const enemy = world.entities.find((candidate) => candidate.team !== world.playerTeam);
    if (world.vision === null || ally === undefined || enemy === undefined) {
      throw new Error('incoming presentation test needs private opposing teams');
    }
    world.vision.visible.delete(enemy.id);
    const fire = vi.spyOn(TracerLayer.prototype, 'fire').mockImplementation(() => undefined);
    const muzzle = vi.fn(() => false);
    const feedback = new BattleEffects(
      new Scene(),
      new Color(0x1a2024),
      new TacticalCamera(false),
      () => 0,
      (id) => id === ally.id ? ally.pos : enemy.pos,
      muzzle,
    );

    feedback.consume(world, [
      event('cluster', enemy.id, ally.id),
      event('slug', enemy.id, ally.id),
    ]);

    expect(fire.mock.calls.map((call) => ({
      projectiles: call[3],
      visibleFlightSeconds: call[9],
    }))).toEqual([
      { projectiles: 10, visibleFlightSeconds: 0.09 },
      { projectiles: 1, visibleFlightSeconds: 0.09 },
    ]);
    expect(muzzle).not.toHaveBeenCalled();
    feedback.destroy();
  });
});
