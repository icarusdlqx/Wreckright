import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { setHoldFire, setPosture } from './orders';
import { createWorld, stepWorld } from './world';

describe('authored enemy objective pressure', () => {
  it.each([
    ['workshop_defence', 'gantry_control'],
    ['recovery_window', 'recovery_ground'],
    ['conduit_breach', 'east_breaker'],
  ])('%s cannot be won by abandoning its defended ground', (missionId, zoneId) => {
    const world = createWorld(catalog, { seed: 'abandoned-ground', missionId: missionId!, playerTeam: 0 });
    // Isolate objective pressure from combat: the company is alive, silent and far from its duty.
    world.entities.filter((entity) => entity.team === 0).forEach((entity, index) => {
      entity.pos = { x: 924 - index * 60, y: 924 };
      setPosture(entity, 'hold_position');
      setHoldFire(entity, true);
    });
    const limit = Math.ceil(world.mission.maxDurationSeconds / world.dt);
    while (!world.finished && world.tick < limit) stepWorld(world, limit);
    const taken = world.events.find((event) => event.type === 'zone_captured' &&
      event.zoneId === zoneId && event.team === 1);
    expect(taken, JSON.stringify({ status: world.missionStatus, seconds: world.tick * world.dt,
      zone: world.zones.find((zone) => zone.id === zoneId),
      enemy: world.entities.filter((entity) => entity.team === 1).map((entity) => ({
        pos: entity.pos, duty: entity.ai.directiveId, destination: entity.ai.destination,
      })),
    })).toBeDefined();
    expect(world.missionStatus).toBe('failure');
  });
});
