import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { visionFor } from '../sensors';
import { createWorld } from '../world';
import { runSupportDoctrine } from './support';
import { difficultyTier } from './tactical';

describe('support doctrine state lifecycle', () => {
  it('never spends the human orders team resources', () => {
    const world = createWorld(catalog, {
      seed: 'orders-no-spend', missionId: 'base_capture_ridge', playerTeam: 0, difficulty: 'elite',
    });
    const before = world.rules.support.artillery_strike.cost + 10_000;
    world.resources.set(0, before);

    runSupportDoctrine(world, 0, difficultyTier(world, 'elite'));

    expect(world.resources.get(0)).toBe(before);
    expect(world.support.pending.some((entry) => entry.team === 0)).toBe(false);
  });

  it('clears extinct-team observations without bypassing a reinforcement cooldown', () => {
    const world = createWorld(catalog, {
      seed: 'support-reinforcement-memory',
      missionId: 'base_capture_ridge',
      playerTeam: 0,
      difficulty: 'elite',
    });
    const caller = world.entities.find((entity) => entity.team === 1);
    const targets = world.entities.filter((entity) => entity.team === 0).slice(0, 2);
    const zone = world.zones[0];
    const vision = visionFor(world, 1);
    if (caller === undefined || targets.length < 2 || zone === undefined || vision === null) {
      throw new Error('support lifecycle fixture is incomplete');
    }
    for (const entity of world.entities) {
      entity.destroyed = entity !== caller && !targets.includes(entity);
    }
    targets.forEach((target, index) => {
      target.pos = { x: zone.x + (index === 0 ? -10 : 10), y: zone.y };
      target.motion = 'stationary';
      vision.visible.add(target.id);
    });
    const key = `1:${zone.id}:0`;
    const holdTicks = Math.round(world.rules.ai.support.artillery.holdSeconds / world.dt);
    world.aiSupport.artilleryPressureSinceTick.set(key, world.tick - holdTicks);
    world.resources.set(
      1,
      world.rules.support.artillery_strike.cost + world.rules.ai.support.minimumResourceReserve,
    );
    const tier = difficultyTier(world, 'elite');
    runSupportDoctrine(world, 1, tier);
    const nextCallTick = world.aiSupport.nextCallTickByTeam.get(1);
    if (nextCallTick === undefined) throw new Error('support call did not start its cooldown');
    expect(world.aiSupport.artilleryLatches.size).toBe(1);
    expect(world.aiSupport.observedEnemyPositions.size).toBeGreaterThan(0);

    caller.destroyed = true;
    world.tick += 1;
    runSupportDoctrine(world, 1, tier);
    expect(world.aiSupport.nextCallTickByTeam.get(1)).toBe(nextCallTick);
    expect(world.aiSupport.artilleryPressureSinceTick.size).toBe(0);
    expect(world.aiSupport.artilleryLatches.size).toBe(0);
    expect(world.aiSupport.observedEnemyPositions.size).toBe(0);

    caller.destroyed = false;
    world.support.pending.length = 0;
    world.events.length = 0;
    world.resources.set(1, world.rules.support.artillery_strike.cost + 10_000);
    runSupportDoctrine(world, 1, tier);
    expect(world.support.pending).toEqual([]);
    expect(world.tick).toBeLessThan(nextCallTick);
  });
});
