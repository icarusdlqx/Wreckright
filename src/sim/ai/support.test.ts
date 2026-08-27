import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { eventsOfType } from '../events';
import { distance } from '../math';
import { visionFor } from '../sensors';
import { updateSupport, type SupportCallId } from '../support';
import type { MechEntity, World } from '../types';
import { createWorld, stepWorld } from '../world';
import { runSupportDoctrine } from './support';
import { difficultyTier } from './tactical';

const CALLER_TEAM = 1;
const TARGET_TEAM = 0;

function worldFor(seed: string, missionId = 'skirmish_ridge'): World {
  return createWorld(catalog, { seed, missionId, playerTeam: TARGET_TEAM, difficulty: 'elite' });
}

function requireEntities(world: World, team: number, count: number): MechEntity[] {
  const entities = world.entities.filter((entity) => entity.team === team).slice(0, count);
  if (entities.length !== count) throw new Error(`need ${count} entities for team ${team}`);
  return entities;
}

function keepOnly(world: World, kept: readonly MechEntity[]): void {
  const ids = new Set(kept.map((entity) => entity.id));
  for (const entity of world.entities) entity.destroyed = !ids.has(entity.id);
}

function expose(world: World, team: number, entities: readonly MechEntity[]): void {
  const vision = visionFor(world, team);
  if (vision === null) throw new Error(`team ${team} has no vision`);
  vision.visible.clear();
  for (const entity of entities) vision.visible.add(entity.id);
}

function fund(world: World, team: number, call: SupportCallId, extra = 0): number {
  const reserve = world.rules.ai.support.minimumResourceReserve;
  const balance = world.rules.support[call].cost + reserve + extra;
  world.resources.set(team, balance);
  return balance;
}

function calls(world: World, team = CALLER_TEAM) {
  return eventsOfType(world.events, 'support_called').filter((event) => event.team === team);
}

function artilleryKey(zone: World['zones'][number]): string {
  return `${CALLER_TEAM}:${zone.id}:${TARGET_TEAM}`;
}

function primeArtilleryDwell(world: World, zone: World['zones'][number], ticksEarly = 0): void {
  const holdTicks = Math.round(world.rules.ai.support.artillery.holdSeconds / world.dt);
  world.aiSupport.artilleryPressureSinceTick.set(
    artilleryKey(zone),
    world.tick - holdTicks + ticksEarly,
  );
}

function artilleryWorld(seed: string): {
  world: World;
  targets: [MechEntity, MechEntity];
  zone: World['zones'][number];
} {
  const world = worldFor(seed, 'base_capture_ridge');
  const [first, second] = requireEntities(world, TARGET_TEAM, 2);
  const caller = requireEntities(world, CALLER_TEAM, 1)[0];
  const zone = world.zones[0];
  if (first === undefined || second === undefined || caller === undefined || zone === undefined) {
    throw new Error('artillery fixture is incomplete');
  }
  keepOnly(world, [caller, first, second]);
  first.pos = { x: zone.x - 10, y: zone.y };
  second.pos = { x: zone.x + 10, y: zone.y };
  first.motion = 'stationary';
  second.motion = 'stationary';
  zone.owner = TARGET_TEAM;
  expose(world, CALLER_TEAM, [first, second]);
  fund(world, CALLER_TEAM, 'artillery_strike');
  primeArtilleryDwell(world, zone);
  return { world, targets: [first, second], zone };
}

describe('support doctrine tier gate', () => {
  it.each(['green', 'regular'])('%s never spends support resources', (tierId) => {
    const { world } = artilleryWorld(`support-off-${tierId}`);
    const before = world.resources.get(CALLER_TEAM);

    runSupportDoctrine(world, CALLER_TEAM, difficultyTier(world, tierId));

    expect(calls(world)).toEqual([]);
    expect(world.support.pending).toEqual([]);
    expect(world.resources.get(CALLER_TEAM)).toBe(before);
  });

  it.each(['veteran', 'elite'])('%s may call support when doctrine is eligible', (tierId) => {
    const { world } = artilleryWorld(`support-on-${tierId}`);

    runSupportDoctrine(world, CALLER_TEAM, difficultyTier(world, tierId));

    expect(calls(world).map((event) => event.call)).toEqual(['artillery_strike']);
    expect(world.support.pending).toHaveLength(1);
  });
});

it('consults support doctrine from the elite world decision loop', () => {
  const { world } = artilleryWorld('support-world-loop');
  const caller = requireEntities(world, CALLER_TEAM, 1)[0];
  if (caller === undefined) throw new Error('need a world-loop caller');
  caller.sightRange = 2_000;

  stepWorld(world, world.tick + 1_000);

  expect(calls(world).map((event) => event.call)).toEqual(['artillery_strike']);
  expect(world.support.pending[0]?.resolveTick).toBe(
    world.tick + Math.round(world.rules.support.artillery_strike.delaySeconds / world.dt),
  );
});

describe('artillery doctrine', () => {
  it('requires two clustered stationary contacts held for the authored time', () => {
    const one = artilleryWorld('artillery-one');
    one.targets[1].destroyed = true;
    runSupportDoctrine(one.world, CALLER_TEAM, difficultyTier(one.world, 'elite'));
    expect(calls(one.world)).toEqual([]);

    const spread = artilleryWorld('artillery-spread');
    const halfGap = spread.world.rules.ai.support.artillery.clusterRadius / 2 + 0.5;
    spread.targets[0].pos.x = spread.zone.x - halfGap;
    spread.targets[1].pos.x = spread.zone.x + halfGap;
    runSupportDoctrine(spread.world, CALLER_TEAM, difficultyTier(spread.world, 'elite'));
    expect(calls(spread.world)).toEqual([]);

    const early = artilleryWorld('artillery-early');
    primeArtilleryDwell(early.world, early.zone, 1);
    runSupportDoctrine(early.world, CALLER_TEAM, difficultyTier(early.world, 'elite'));
    expect(calls(early.world)).toEqual([]);

    const exact = artilleryWorld('artillery-exact');
    exact.zone.owner = null;
    const halfRadius = exact.world.rules.ai.support.artillery.clusterRadius / 2;
    exact.targets[0].pos.x = exact.zone.x - halfRadius;
    exact.targets[1].pos.x = exact.zone.x + halfRadius;
    runSupportDoctrine(exact.world, CALLER_TEAM, difficultyTier(exact.world, 'elite'));
    expect(calls(exact.world).map((event) => event.call)).toEqual(['artillery_strike']);
  });

  it('keeps the minimum reserve and accepts the exact boundary', () => {
    const blocked = artilleryWorld('artillery-reserve-blocked');
    const cost = blocked.world.rules.support.artillery_strike.cost;
    const reserve = blocked.world.rules.ai.support.minimumResourceReserve;
    blocked.world.resources.set(CALLER_TEAM, cost + reserve - 1);
    runSupportDoctrine(blocked.world, CALLER_TEAM, difficultyTier(blocked.world, 'elite'));
    expect(calls(blocked.world)).toEqual([]);
    expect(blocked.world.resources.get(CALLER_TEAM)).toBe(cost + reserve - 1);

    const exact = artilleryWorld('artillery-reserve-exact');
    exact.world.resources.set(CALLER_TEAM, cost + reserve);
    runSupportDoctrine(exact.world, CALLER_TEAM, difficultyTier(exact.world, 'elite'));
    expect(calls(exact.world).map((event) => event.call)).toEqual(['artillery_strike']);
    expect(exact.world.resources.get(CALLER_TEAM)).toBe(reserve);
  });

  it('holds every call behind the team cooldown', () => {
    const { world, targets, zone } = artilleryWorld('artillery-cooldown');
    fund(world, CALLER_TEAM, 'artillery_strike', world.rules.support.artillery_strike.cost);
    const tier = difficultyTier(world, 'elite');
    runSupportDoctrine(world, CALLER_TEAM, tier);
    const nextTick = world.aiSupport.nextCallTickByTeam.get(CALLER_TEAM);
    const nextZone = world.zones[1];
    if (nextTick === undefined || nextZone === undefined) throw new Error('need cooldown fixture');

    world.support.pending.length = 0;
    world.events.length = 0;
    zone.owner = CALLER_TEAM;
    nextZone.owner = TARGET_TEAM;
    targets[0].pos = { x: nextZone.x - 10, y: nextZone.y };
    targets[1].pos = { x: nextZone.x + 10, y: nextZone.y };
    primeArtilleryDwell(world, nextZone);
    world.tick = nextTick - 1;
    runSupportDoctrine(world, CALLER_TEAM, tier);
    expect(calls(world)).toEqual([]);

    world.tick = nextTick;
    runSupportDoctrine(world, CALLER_TEAM, tier);
    expect(calls(world).map((event) => event.call)).toEqual(['artillery_strike']);
  });

  it('latches an occupied zone until the qualifying hold breaks', () => {
    const { world, targets } = artilleryWorld('artillery-latch');
    fund(world, CALLER_TEAM, 'artillery_strike', world.rules.support.artillery_strike.cost);
    const tier = difficultyTier(world, 'elite');
    runSupportDoctrine(world, CALLER_TEAM, tier);
    const nextTick = world.aiSupport.nextCallTickByTeam.get(CALLER_TEAM);
    if (nextTick === undefined) throw new Error('artillery did not start its cooldown');
    world.support.pending.length = 0;
    world.events.length = 0;
    world.tick = nextTick;

    runSupportDoctrine(world, CALLER_TEAM, tier);
    expect(calls(world)).toEqual([]);
    expect(world.aiSupport.artilleryLatches.size).toBe(1);

    targets[0].motion = 'run';
    runSupportDoctrine(world, CALLER_TEAM, tier);
    expect(world.aiSupport.artilleryLatches.size).toBe(0);
    expect(world.aiSupport.artilleryPressureSinceTick.size).toBe(0);
    targets[0].motion = 'stationary';
    runSupportDoctrine(world, CALLER_TEAM, tier);
    expect(calls(world)).toEqual([]);
    world.tick += Math.round(world.rules.ai.support.artillery.holdSeconds / world.dt);
    runSupportDoctrine(world, CALLER_TEAM, tier);
    expect(calls(world).map((event) => event.call)).toEqual(['artillery_strike']);
  });

  it('makes an identical call from identical seeded worlds', () => {
    const first = artilleryWorld('artillery-repeat').world;
    const second = artilleryWorld('artillery-repeat').world;
    runSupportDoctrine(first, CALLER_TEAM, difficultyTier(first, 'elite'));
    runSupportDoctrine(second, CALLER_TEAM, difficultyTier(second, 'elite'));

    const snapshot = (world: World) => ({
      pending: world.support.pending,
      resources: world.resources.get(CALLER_TEAM),
      calls: calls(world),
      cooldown: [...world.aiSupport.nextCallTickByTeam],
      pressure: [...world.aiSupport.artilleryPressureSinceTick],
      latches: [...world.aiSupport.artilleryLatches],
    });
    expect(snapshot(second)).toEqual(snapshot(first));
  });

  it('does not read a hostile controller route or intended motion', () => {
    const parked = artilleryWorld('artillery-private-orders');
    const privatelyOrdered = artilleryWorld('artillery-private-orders');
    privatelyOrdered.targets[0].intendedMotion = 'run';
    privatelyOrdered.targets[0].path = [{ x: 900, y: 900 }];
    runSupportDoctrine(parked.world, CALLER_TEAM, difficultyTier(parked.world, 'elite'));
    runSupportDoctrine(
      privatelyOrdered.world,
      CALLER_TEAM,
      difficultyTier(privatelyOrdered.world, 'elite'),
    );

    expect(privatelyOrdered.world.support.pending).toEqual(parked.world.support.pending);
    expect(calls(privatelyOrdered.world)).toEqual(calls(parked.world));
  });

});

describe('other support doctrine', () => {
  it('strikes a clustered, aligned advance but rejects divergent movement', () => {
    const arrange = (seed: string): World => {
      const world = worldFor(seed);
      const targets = requireEntities(world, TARGET_TEAM, 3);
      const caller = requireEntities(world, CALLER_TEAM, 1)[0];
      if (caller === undefined) throw new Error('need an air-strike caller');
      keepOnly(world, [caller, ...targets]);
      targets.forEach((target, index) => {
        target.pos = { x: 420 + index * 16, y: 440 + index * 8 };
        target.motion = 'run';
      });
      expose(world, CALLER_TEAM, targets);
      fund(world, CALLER_TEAM, 'air_strike');
      return world;
    };

    const advance = (world: World, headings: readonly number[]): void => {
      runSupportDoctrine(world, CALLER_TEAM, difficultyTier(world, 'elite'));
      expect(calls(world)).toEqual([]);
      const step = world.rules.ai.support.airStrike.minimumAdvanceDistance + 1;
      requireEntities(world, TARGET_TEAM, headings.length).forEach((target, index) => {
        const heading = headings[index] ?? 0;
        target.pos.x += Math.cos(heading) * step;
        target.pos.y += Math.sin(heading) * step;
      });
      world.tick += world.rules.simulation.aiDecisionIntervalTicks;
      runSupportDoctrine(world, CALLER_TEAM, difficultyTier(world, 'elite'));
    };

    const heading = Math.PI / 4;
    const aligned = arrange('air-aligned');
    advance(aligned, [heading, heading, heading]);
    expect(aligned.support.pending[0]?.call).toBe('air_strike');
    expect(aligned.support.pending[0]?.heading).toBeCloseTo(heading);
    const resolveTick = aligned.support.pending[0]?.resolveTick;
    if (resolveTick === undefined) throw new Error('air strike was not queued');
    const struck = requireEntities(aligned, TARGET_TEAM, 3);
    const before = struck.map((target) => target.stats.damageTaken);
    aligned.tick = resolveTick;
    updateSupport(aligned);
    expect(struck.map((target, index) => target.stats.damageTaken > (before[index] ?? 0)))
      .toEqual([true, true, true]);

    const divergent = arrange('air-divergent');
    advance(divergent, [0, 2 * Math.PI / 3, -2 * Math.PI / 3]);
    expect(calls(divergent)).toEqual([]);

    const tooWide = arrange('air-too-wide');
    requireEntities(tooWide, TARGET_TEAM, 3).forEach((target, index) => {
      target.pos = { x: 420, y: 400 + index * 50 };
    });
    advance(tooWide, [0, 0, 0]);
    expect(calls(tooWide)).toEqual([]);
  });

  it('probes unexplored ground from its own route without reading hidden enemies', () => {
    const arrange = (seed: string, hiddenAt: { x: number; y: number }): World => {
      const world = worldFor(seed);
      const caller = requireEntities(world, CALLER_TEAM, 1)[0];
      const hidden = requireEntities(world, TARGET_TEAM, 1)[0];
      if (caller === undefined || hidden === undefined) throw new Error('need a probe fixture');
      keepOnly(world, [caller, hidden]);
      caller.pos = { x: 120, y: 120 };
      caller.path = [{ x: 600, y: 120 }];
      caller.pathIndex = 0;
      caller.intendedMotion = 'run';
      hidden.pos = hiddenAt;
      const vision = visionFor(world, CALLER_TEAM);
      if (vision === null) throw new Error('probe caller has no vision');
      vision.visible.clear();
      vision.tiles.fill(0);
      fund(world, CALLER_TEAM, 'sensor_probe');
      return world;
    };

    const first = arrange('probe-private', { x: 820, y: 820 });
    const second = arrange('probe-private', { x: 700, y: 120 });
    runSupportDoctrine(first, CALLER_TEAM, difficultyTier(first, 'elite'));
    runSupportDoctrine(second, CALLER_TEAM, difficultyTier(second, 'elite'));

    expect(first.support.pending[0]?.call).toBe('sensor_probe');
    expect(second.support.pending[0]).toEqual(first.support.pending[0]);
  });

  it('repairs a safe damaged heavy behind its line and refuses one under threat', () => {
    const arrange = (seed: string, gap: number): { world: World; heavy: MechEntity; enemy: MechEntity } => {
      const world = worldFor(seed);
      const heavy = world.entities.find((entity) =>
        entity.team === CALLER_TEAM && entity.tonnage >= world.rules.ai.support.repairTruck.minimumTonnage,
      );
      const enemy = requireEntities(world, TARGET_TEAM, 1)[0];
      if (heavy === undefined || enemy === undefined) throw new Error('need a repair fixture');
      keepOnly(world, [heavy, enemy]);
      heavy.pos = { x: 500, y: 500 };
      heavy.motion = 'stationary';
      for (const location of Object.values(heavy.locations)) {
        location.armour = location.armourMax * 0.4;
        location.rearArmour = location.rearArmourMax * 0.4;
      }
      enemy.pos = { x: heavy.pos.x + gap, y: heavy.pos.y };
      enemy.motion = 'stationary';
      expose(world, CALLER_TEAM, [enemy]);
      fund(world, CALLER_TEAM, 'repair_truck');
      return { world, heavy, enemy };
    };

    const safe = arrange('repair-safe', 300);
    runSupportDoctrine(safe.world, CALLER_TEAM, difficultyTier(safe.world, 'elite'));
    const truck = safe.world.support.pending[0];
    expect(truck?.call).toBe('repair_truck');
    if (truck === undefined) throw new Error('repair truck was not called');
    expect(distance(truck.target, safe.heavy.pos)).toBeLessThanOrEqual(
      safe.world.rules.support.repair_truck.radius,
    );
    expect(distance(truck.target, safe.enemy.pos)).toBeGreaterThan(
      distance(safe.heavy.pos, safe.enemy.pos),
    );
    for (const entity of [safe.heavy, safe.enemy]) {
      for (const weapon of entity.weapons) weapon.destroyed = true;
    }
    const armourBefore = Object.values(safe.heavy.locations).reduce(
      (total, location) => total + location.armour + location.rearArmour,
      0,
    );
    while (safe.world.tick < truck.resolveTick) stepWorld(safe.world, truck.resolveTick + 100);
    const armourAfter = Object.values(safe.heavy.locations).reduce(
      (total, location) => total + location.armour + location.rearArmour,
      0,
    );
    expect(safe.heavy.path).toEqual([]);
    expect(safe.world.support.trucks).toHaveLength(1);
    expect(armourAfter).toBeGreaterThan(armourBefore);

    const unsafe = arrange(
      'repair-unsafe',
      safe.world.rules.ai.support.repairTruck.safeEnemyRange - 1,
    );
    runSupportDoctrine(unsafe.world, CALLER_TEAM, difficultyTier(unsafe.world, 'elite'));
    expect(calls(unsafe.world)).toEqual([]);
  });
});
