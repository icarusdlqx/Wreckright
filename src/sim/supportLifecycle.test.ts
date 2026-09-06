import { describe, expect, it } from 'vitest';
import { makeGrid, playerWorld, unitOf } from '../../tests/support';
import { LOCATIONS } from '../schema/common';
import { eventsOfType } from './events';
import { isDetectedBy, isVisibleTo, trackFor, updateTeamVisions, visionFor } from './sensors';
import { callSupport, updateSupport } from './support';
import type { MechEntity, World } from './types';

function supportWorld(seed = 'support-lifecycle'): World {
  const world = playerWorld(seed);
  world.resources.set(0, 10_000);
  world.terrain = makeGrid({ tiles: ['...', '.#.', '...'], legend: { '.': 'open', '#': 'building' }, tileSize: 300 });
  world.events.length = 0;
  return world;
}

function armourTotal(entity: MechEntity): number {
  return LOCATIONS.reduce((total, location) => total + entity.locations[location].armour + entity.locations[location].rearArmour, 0);
}

describe('support request validation', () => {
  it.each(['repair_truck', 'reinforcement'] as const)('refuses a blocked %s site before charging resources', (call) => {
    const world = supportWorld();
    world.reserves.push({ designId: 'wisp_scout', pilotId: 'nadia_ostrow', facingDegrees: 0 });
    const resources = world.resources.get(0);
    const result = callSupport(world, 0, call, { x: 450, y: 450 });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/clear ground/);
    expect(world.resources.get(0)).toBe(resources);
    expect(world.support.pending).toEqual([]);
    expect(world.events).toEqual([]);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('rejects an invalid air lane heading (%s) without charging', (heading) => {
    const world = supportWorld();
    const resources = world.resources.get(0);
    expect(callSupport(world, 0, 'air_strike', { x: 100, y: 100 }, heading).ok).toBe(false);
    expect(world.resources.get(0)).toBe(resources);
    expect(world.support.pending).toEqual([]);
    expect(world.events).toEqual([]);
  });

  it.each(['sensor_probe', 'air_strike'] as const)('still allows a %s over blocked, unexplored terrain', (call) => {
    const world = supportWorld();
    const resources = world.resources.get(0) ?? 0;
    expect(callSupport(world, 0, call, { x: 450, y: 450 }).ok).toBe(true);
    expect(world.resources.get(0)).toBe(resources - world.rules.support[call].cost);
  });

  it('does not sell a mission reserve twice while its first drop is inbound', () => {
    const world = supportWorld();
    world.reserves = [{ designId: 'wisp_scout', pilotId: 'nadia_ostrow', facingDegrees: 0 }];
    const resources = world.resources.get(0) ?? 0;
    expect(callSupport(world, 0, 'reinforcement', { x: 100, y: 100 }).ok).toBe(true);
    const duplicate = callSupport(world, 0, 'reinforcement', { x: 200, y: 100 });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.reason).toMatch(/reserves/);
    expect(world.resources.get(0)).toBe(resources - world.rules.support.reinforcement.cost);
    expect(world.support.pending).toHaveLength(1);

    world.tick = world.support.pending[0]!.resolveTick;
    const before = world.entities.length;
    updateSupport(world);
    expect(world.entities).toHaveLength(before + 1);
    expect(world.reserves).toEqual([]);
  });
});

describe('support working time and effect', () => {
  it('resolves a zero-delay probe while the clock is stopped without granting optical sight', () => {
    const world = playerWorld('probe-paused-command');
    world.resources.set(0, 10_000);
    const hostile = world.entities.find((entity) => entity.team === 1)!;
    for (const entity of world.entities) {
      entity.pos = entity.team === 0 ? { x: 40, y: 40 } : { x: 850, y: 850 };
      entity.sensorRange = 0;
      entity.sightRange = 0;
    }
    updateTeamVisions(world);
    if (world.vision === null) throw new Error('need player vision for a probe');
    expect(isDetectedBy(world.vision, hostile)).toBe(false);
    const before = {
      tick: world.tick,
      resources: world.resources.get(0) ?? 0,
      rng: world.rng.save(),
      units: world.entities.map((entity) => structuredClone(entity)),
      visible: [...world.vision.visible],
      tiles: world.vision.tiles.slice(),
      explored: world.vision.explored.slice(),
      opposition: structuredClone(visionFor(world, 1)),
    };

    expect(callSupport(world, 0, 'sensor_probe', hostile.pos).ok).toBe(true);

    expect(world.tick).toBe(before.tick);
    expect(world.rng.save()).toEqual(before.rng);
    expect(world.entities).toEqual(before.units);
    expect(world.support.pending).toEqual([]);
    expect(world.reveals).toHaveLength(1);
    expect(isDetectedBy(world.vision, hostile)).toBe(true);
    expect(trackFor(world.vision, hostile)?.source).toBe('sensor');
    expect(isVisibleTo(world.vision, hostile)).toBe(false);
    expect([...world.vision.visible]).toEqual(before.visible);
    expect(world.vision.tiles).toEqual(before.tiles);
    expect(world.vision.explored).toEqual(before.explored);
    expect(visionFor(world, 1)).toEqual(before.opposition);
    expect(world.resources.get(0)).toBe(before.resources - world.rules.support.sensor_probe.cost);
    expect(world.events.filter((event) => event.type === 'support_called' || event.type === 'support_resolved')
      .map((event) => [event.type, event.tick, event.call])).toEqual([
      ['support_called', before.tick, 'sensor_probe'],
      ['support_resolved', before.tick, 'sensor_probe'],
    ]);
    expect(eventsOfType(world.events, 'support_resolved').at(-1)).toMatchObject({ call: 'sensor_probe', tick: before.tick, contactCount: 4 });
    updateSupport(world);
    expect(eventsOfType(world.events, 'support_resolved')).toHaveLength(1);
    const expiry = world.tick + Math.round(world.rules.support.sensor_probe.durationSeconds / world.dt);
    expect(world.reveals[0]!.expiresTick).toBe(expiry);
    world.tick = expiry;
    updateSupport(world);
    updateTeamVisions(world);
    expect(isDetectedBy(world.vision, hostile)).toBe(false);
  });

  it('repairs the team at the chosen location only after arrival, for exactly its authored duration', () => {
    const world = supportWorld('repair-arrival-duration');
    const inside = unitOf(world, 'bulwark_assault');
    const outside = unitOf(world, 'wisp_scout');
    const hostile = world.entities.find((entity) => entity.team !== inside.team)!;
    inside.pos = { x: 100, y: 100 };
    outside.pos = { x: 800, y: 100 };
    hostile.pos = { ...inside.pos };
    for (const entity of [inside, outside, hostile]) {
      for (const location of LOCATIONS) {
        entity.locations[location].armour = 0;
        entity.locations[location].rearArmour = 0;
      }
    }
    const rules = world.rules.support.repair_truck;
    expect(callSupport(world, inside.team, 'repair_truck', inside.pos).ok).toBe(true);
    const arrivalTick = world.support.pending[0]!.resolveTick;
    world.tick = arrivalTick - 1;
    updateSupport(world);
    expect(armourTotal(inside)).toBe(0);
    expect(world.support.trucks).toEqual([]);

    const durationTicks = Math.round(rules.durationSeconds / world.dt);
    world.tick = arrivalTick;
    updateSupport(world);
    const truck = world.support.trucks[0]!;
    for (world.tick = arrivalTick + 1; world.tick <= arrivalTick + durationTicks; world.tick += 1) updateSupport(world);

    expect(armourTotal(inside)).toBeCloseTo(rules.armourPerSecond * rules.durationSeconds);
    expect(armourTotal(outside)).toBe(0);
    expect(armourTotal(hostile)).toBe(0);
    expect(truck.repairedArmour).toBeCloseTo(armourTotal(inside));
    expect(world.support.trucks).toEqual([]);
    expect(eventsOfType(world.events, 'support_resolved').filter((event) => event.call === 'repair_truck')).toHaveLength(1);
  });

  it('does not revive expired mines for one final damage tick', () => {
    const world = supportWorld('mine-expiry');
    const hostile = world.entities.find((entity) => entity.team === 1)!;
    world.support.minefields.push({ team: 0, pos: { ...hostile.pos }, radius: 50, mines: 1, damage: 20, expiresTick: world.tick, triggered: [] });
    const before = hostile.stats.damageTaken;
    updateSupport(world);
    expect(hostile.stats.damageTaken).toBe(before);
    expect(world.support.minefields).toEqual([]);
  });

  it('applies one delayed air strike to hostiles on the actual lane without revealing the target area', () => {
    const world = supportWorld('air-arrival');
    const friendly = world.entities.find((entity) => entity.team === 0)!;
    const hostile = world.entities.find((entity) => entity.team === 1)!;
    const flanker = world.entities.filter((entity) => entity.team === 1)[1]!;
    const at = { x: 450, y: 150 };
    friendly.pos = { ...at };
    hostile.pos = { ...at };
    flanker.pos = { x: at.x, y: at.y + world.rules.support.air_strike.width };
    for (const entity of world.entities) {
      if (![friendly, hostile, flanker].includes(entity)) entity.pos = { x: 850, y: 850 };
    }
    if (world.vision === null) throw new Error('need player vision for a strike');
    const vision = world.vision.tiles.slice();
    expect(callSupport(world, 0, 'air_strike', at).ok).toBe(true);
    const arrivalTick = world.support.pending[0]!.resolveTick;
    world.tick = arrivalTick - 1;
    updateSupport(world);
    expect(hostile.stats.damageTaken).toBe(0);
    world.tick = arrivalTick;
    updateSupport(world);
    const damage = hostile.stats.damageTaken;
    expect(damage).toBeGreaterThan(0);
    expect(friendly.stats.damageTaken).toBe(0);
    expect(flanker.stats.damageTaken).toBe(0);
    world.tick += 1;
    updateSupport(world);
    expect(hostile.stats.damageTaken).toBe(damage);
    expect(world.vision.tiles).toEqual(vision);
    expect(world.reveals).toEqual([]);
    expect(eventsOfType(world.events, 'support_resolved').filter((event) => event.call === 'air_strike')).toHaveLength(1);
  });
});
