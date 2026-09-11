import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { issueMove, setHoldFire, setPosture } from './orders';
import { isOperational } from './types';
import { createWorld, stepWorld } from './world';

const RECOVERY = [
  ['recovery_window', 'winch_controls', 'line_recovery_cut'],
  ['custody_resupply', 'transfer_relay', 'aurelian_landing_apron'],
] as const;

describe('opening recovery work', () => {
  it.each(RECOVERY)('%s has reachable work and a distinct third-contract location', (id, controlId, mapId) => {
    const world = createWorld(catalog, { seed: 'recovery-route', missionId: id, playerTeam: 0 });
    expect(world.mission.mapId).toBe(mapId);
    const controls = world.zones.find(zone => zone.id === controlId)!;
    for (const entity of world.entities) {
      expect(world.terrain.typeAtPoint(entity.pos).passable).toBe(true);
      if (entity.team === 0) expect(issueMove(world, entity, controls, true)).toBe(true);
    }
    for (const zone of world.zones) expect(world.terrain.typeAtPoint(zone).passable).toBe(true);
  });

  it.each(RECOVERY)('%s allows a completed lift while disabled claimants remain alive', (id, controlId) => {
    const world = createWorld(catalog, { seed: 'preserved-claimants', missionId: id, playerTeam: 0 });
    // Isolate the contract rule: the opposition has already been legged and spared.
    for (const entity of world.entities) {
      setHoldFire(entity, true);
      setPosture(entity, 'hold_position');
      if (entity.team === 1) {
        entity.locations.left_leg.destroyed = true;
        entity.locations.right_leg.destroyed = true;
      }
    }
    const scout = world.entities.find(entity => entity.team === 0)!;
    const controls = world.zones.find(zone => zone.id === controlId)!;
    expect(issueMove(world, scout, controls, true)).toBe(true);
    const limit = Math.ceil(world.mission.maxDurationSeconds / world.dt);
    while (!world.finished && world.tick < limit) stepWorld(world, limit);
    expect(world.missionStatus).toBe('success');
    expect(world.tick * world.dt).toBeLessThan(120);
    expect(world.entities.filter(entity => entity.team === 1).every(isOperational)).toBe(true);
  });

  it.each(RECOVERY)('%s cannot complete merely by waiting without operating the controls', (id) => {
    const world = createWorld(catalog, { seed: 'unworked-recovery', missionId: id, playerTeam: 0 });
    for (const entity of world.entities) {
      setHoldFire(entity, true);
      if (entity.team === 1) {
        entity.locations.left_leg.destroyed = true;
        entity.locations.right_leg.destroyed = true;
      }
      setPosture(entity, 'hold_position');
    }
    const limit = Math.ceil(world.mission.maxDurationSeconds / world.dt);
    while (!world.finished && world.tick < limit) stepWorld(world, limit);
    expect(world.missionStatus).toBe('failure');
    expect(world.objectives.find(objective => objective.type === 'hold_zones')?.status).toBe('active');
  });
});
