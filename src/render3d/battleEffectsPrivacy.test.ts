import { Color, Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { playerWorld } from '../../tests/support';
import type { SimEvent } from '../sim/events';
import { BattleEffects } from './battleEffects';
import { TacticalCamera } from './camera';
import { TracerLayer } from './tracers';

describe('private battle effects', () => {
  it('tracks target-side incoming fire to impact without revealing its hidden shooter', () => {
    const world = playerWorld('partly-visible-fire');
    const ally = world.entities.find((entity) => entity.team === world.playerTeam);
    const enemies = world.entities.filter((entity) => entity.team !== world.playerTeam);
    const firstEnemy = enemies[0];
    const secondEnemy = enemies[1];
    expect(world.vision).not.toBeNull();
    expect(ally).toBeDefined();
    expect(firstEnemy).toBeDefined();
    expect(secondEnemy).toBeDefined();
    if (
      world.vision === null || ally === undefined ||
      firstEnemy === undefined || secondEnemy === undefined
    ) return;
    firstEnemy.pos = { x: ally.pos.x + 540, y: ally.pos.y };
    world.vision.visible.delete(firstEnemy.id);
    world.vision.visible.delete(secondEnemy.id);
    const fire = vi.spyOn(TracerLayer.prototype, 'fire').mockImplementation(() => undefined);
    const burst = vi.spyOn(TracerLayer.prototype, 'burst').mockImplementation(() => undefined);
    const resolveMuzzle = vi.fn(() => false);
    const feedback = new BattleEffects(
      new Scene(),
      new Color(0x1a2024),
      new TacticalCamera(false),
      () => 0,
      (id) => id === ally.id ? { x: 120, y: 80 } : { x: 12, y: 18 },
      resolveMuzzle,
    );
    const incomingEvent: Extract<SimEvent, { type: 'weapon_fired' }> = {
      type: 'weapon_fired', tick: 1, shooterId: firstEnemy.id,
      targetId: ally.id, weaponId: 'lrm10',
    };

    feedback.consume(world, [incomingEvent, {
      type: 'weapon_fired', tick: 1, shooterId: ally.id,
      targetId: firstEnemy.id, weaponId: 'ac5',
    }]);

    expect(fire).toHaveBeenCalledTimes(1);
    expect(resolveMuzzle).not.toHaveBeenCalled();
    const incomingOrigin = fire.mock.calls[0]?.[0];
    expect(incomingOrigin).toBeDefined();
    if (incomingOrigin !== undefined) {
      expect(Math.hypot(incomingOrigin.x - 120, incomingOrigin.z - 80)).toBeCloseTo(54);
      expect([incomingOrigin.x, incomingOrigin.z]).not.toEqual([12, 18]);
    }
    expect(fire.mock.calls[0]?.[7]).toBe(incomingEvent);
    expect(fire.mock.calls[0]?.[8]).toBeCloseTo(2.7);
    expect(fire.mock.calls[0]?.[9]).toBeCloseTo(0.27);

    feedback.consume(world, [{
      type: 'projectile_hit', tick: 1, shooterId: firstEnemy.id,
      targetId: ally.id, weaponId: 'ac5', location: 'centre_torso', damage: 8, arc: 'front',
    }]);
    expect(burst).toHaveBeenCalledTimes(1);

    world.vision.visible.add(firstEnemy.id);
    feedback.consume(world, [
      {
        type: 'weapon_fired', tick: 2, shooterId: firstEnemy.id,
        targetId: ally.id, weaponId: 'ac5',
      },
      {
        type: 'weapon_fired', tick: 2, shooterId: ally.id,
        targetId: firstEnemy.id, weaponId: 'ac5',
      },
    ]);
    expect(fire).toHaveBeenCalledTimes(3);
    expect(resolveMuzzle).toHaveBeenCalledTimes(2);

    feedback.consume(world, [{
      type: 'weapon_fired', tick: 3, shooterId: firstEnemy.id,
      targetId: secondEnemy.id, weaponId: 'ac5',
    }]);
    expect(fire).toHaveBeenCalledTimes(3);
    feedback.destroy();
    burst.mockRestore();
    fire.mockRestore();
  });

  it('leaves known rounds on their natural timing when a target disappears unseen', () => {
    const world = playerWorld('hidden-retirement-timing');
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    const ally = world.entities.find((entity) => entity.team === vision.team);
    const enemies = world.entities.filter((entity) => entity.team !== vision.team);
    const destroyed = enemies[0];
    const withdrawn = enemies[1];
    if (ally === undefined || destroyed === undefined || withdrawn === undefined) {
      throw new Error('missing test combatants');
    }
    vision.visible.add(destroyed.id);
    vision.visible.add(withdrawn.id);
    const position = (id: number) => {
      const entity = world.entities.find((candidate) => candidate.id === id);
      return entity === undefined ? null : entity.pos;
    };
    const feedback = new BattleEffects(
      new Scene(),
      new Color(0x1a2024),
      new TacticalCamera(false),
      () => 0,
      position,
      () => false,
    );
    const resolveOutstanding = vi.spyOn(TracerLayer.prototype, 'resolveOutstanding');

    feedback.consume(world, [
      {
        type: 'weapon_fired', tick: 1, shooterId: ally.id,
        targetId: destroyed.id, weaponId: 'lrm10',
      },
      {
        type: 'weapon_fired', tick: 1, shooterId: ally.id,
        targetId: withdrawn.id, weaponId: 'lrm10',
      },
    ]);
    vision.visible.delete(destroyed.id);
    vision.visible.delete(withdrawn.id);
    destroyed.destroyed = true;
    withdrawn.withdrawn = true;

    feedback.consume(world, [
      { type: 'mech_destroyed', tick: 2, entityId: destroyed.id, method: 'centre_torso' },
      { type: 'unit_withdrew', tick: 2, entityId: withdrawn.id, team: withdrawn.team },
    ]);
    expect(resolveOutstanding).not.toHaveBeenCalled();

    vision.observedHulks.add(destroyed.id);
    vision.visible.add(withdrawn.id);
    feedback.consume(world, [
      { type: 'mech_destroyed', tick: 3, entityId: destroyed.id, method: 'centre_torso' },
      { type: 'unit_withdrew', tick: 3, entityId: withdrawn.id, team: withdrawn.team },
    ]);
    expect(resolveOutstanding.mock.calls.map((call) => call[0])).toEqual([
      destroyed.id,
      withdrawn.id,
    ]);

    feedback.destroy();
    resolveOutstanding.mockRestore();
  });
});
