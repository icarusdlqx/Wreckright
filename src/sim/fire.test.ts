import { describe, expect, it } from 'vitest';
import { makeGrid, playerWorld, unitOf } from '../../tests/support';
import type { TerrainFireRules } from '../schema/rules';
import { createFireState, queueIgnition, updateFire } from './fire';
import { updateVision } from './sensors';
import type { World } from './types';
import { toResult } from './world';

type FireOverrides = Omit<Partial<TerrainFireRules>, 'ignitionChance'> & {
  ignitionChance?: Partial<TerrainFireRules['ignitionChance']>;
};

function configureFire(world: World, overrides: FireOverrides): void {
  const authored = world.rules.terrain.fire;
  world.rules = {
    ...world.rules,
    terrain: {
      ...world.rules.terrain,
      fire: {
        ...authored,
        ...overrides,
        ignitionChance: { ...authored.ignitionChance, ...overrides.ignitionChance },
      },
    },
  };
}

function fireWorld(seed: string, tiles: string[] = ['fff']): World {
  const world = playerWorld(seed);
  world.terrain = makeGrid({ tiles, legend: { f: 'forest', '.': 'open' } });
  world.fire = createFireState();
  world.events.length = 0;
  return world;
}

function centre(world: World, cell: number): { x: number; y: number } {
  return world.terrain.tileCentre(cell % world.terrain.width, Math.floor(cell / world.terrain.width));
}

function burningAt(world: World, cell: number, burnoutTick = 100): void {
  world.fire.cells.set(cell, {
    phase: 'burning',
    startedTick: 0,
    burnoutTick,
    nextSpreadTick: world.tick,
  });
}

describe('mutable terrain', () => {
  it('tracks terrain ids and revisions only for real replacements', () => {
    const grid = makeGrid({ tiles: ['f.'], legend: { f: 'forest', '.': 'open' } });

    expect(grid.idAt(0, 0)).toBe('forest');
    expect(grid.idAtPoint(grid.tileCentre(1, 0))).toBe('open');
    expect(grid.revision).toBe(0);
    expect(grid.replaceTypeAt(0, 0, 'forest')).toBe(false);
    expect(grid.replaceTypeAt(0, 0, 'missing')).toBe(false);
    expect(grid.replaceTypeAt(-1, 0, 'burnt_forest')).toBe(false);
    expect(grid.revision).toBe(0);

    expect(grid.replaceTypeAt(0, 0, 'burnt_forest')).toBe(true);
    expect(grid.idAt(0, 0)).toBe('burnt_forest');
    expect(grid.typeAt(0, 0).visionFactor).toBeGreaterThan(0.65);
    expect(grid.revision).toBe(1);
  });
});

describe('authoritative field fire', () => {
  it('queues without drawing, ignites, burns out, mutates terrain and cannot reignite', () => {
    const world = fireWorld('fire-lifecycle', ['f']);
    configureFire(world, {
      burnSeconds: 0.1,
      spreadIntervalSeconds: 1,
      ignitionChance: { ammoExplosion: 1 },
    });
    const beforeQueue = world.rng.save();

    world.tick = 1;
    queueIgnition(world, centre(world, 0), 'ammo_explosion');
    expect(world.rng.save()).toEqual(beforeQueue);
    expect(world.fire.pendingIgnitions).toHaveLength(1);
    updateFire(world);

    const burning = world.fire.cells.get(0);
    expect(burning).toMatchObject({ phase: 'burning', startedTick: 1, burnoutTick: 3 });
    expect(world.events).toContainEqual({ type: 'terrain_ignited', tick: 1, cell: 0 });
    expect(world.terrain.revision).toBe(0);
    queueIgnition(world, centre(world, 0), 'ammo_explosion');
    expect(world.fire.pendingIgnitions).toHaveLength(0);

    world.tick = burning?.burnoutTick ?? 3;
    updateFire(world);
    expect(world.fire.cells.get(0)?.phase).toBe('burnt');
    expect(world.terrain.idAt(0, 0)).toBe('burnt_forest');
    expect(world.terrain.revision).toBe(1);
    expect(world.events).toContainEqual({ type: 'terrain_burned', tick: 3, cell: 0 });
    queueIgnition(world, centre(world, 0), 'ammo_explosion');
    expect(world.fire.pendingIgnitions).toHaveLength(0);
  });

  it('preserves the RNG stream and authoritative state when there is no fire work', () => {
    const world = fireWorld('empty-fire');
    const rng = world.rng.save();

    updateFire(world);

    expect(world.rng.save()).toEqual(rng);
    expect(world.fire).toEqual(createFireState());
    expect(world.terrain.revision).toBe(0);
    expect(world.events).toEqual([]);
  });

  it('merges attempts and targets in canonical order', () => {
    const run = (reverse: boolean) => {
      const world = fireWorld('canonical-fire');
      configureFire(world, {
        ignitionChance: { incendiaryHit: 0.4, artilleryImpact: 0.7 },
      });
      const requests = [
        [0, 'incendiary_hit'],
        [2, 'artillery_impact'],
        [0, 'artillery_impact'],
      ] as const;
      for (const [cell, source] of reverse ? [...requests].reverse() : requests) {
        queueIgnition(world, centre(world, cell), source);
      }
      updateFire(world);
      return {
        cells: [...world.fire.cells.entries()],
        rng: world.rng.save(),
        events: [...world.events],
      };
    };

    expect(run(true)).toEqual(run(false));
  });

  it('replays scripted ignition, spread and burnout exactly from the same seed', () => {
    const run = () => {
      const world = fireWorld('scripted-fire-replay', ['ffff']);
      configureFire(world, {
        burnSeconds: 0.25,
        spreadIntervalSeconds: 0.1,
        baseSpreadChance: 0.35,
        windSpreadChance: 0.4,
        ignitionChance: { ammoExplosion: 1, artilleryImpact: 0.6 },
      });
      world.atmosphere = {
        ...world.atmosphere,
        mechanics: { ...world.atmosphere.mechanics, wind: { x: 0.7, y: 0 } },
      };
      for (let tick = 1; tick <= 14; tick += 1) {
        world.tick = tick;
        if (tick === 1) queueIgnition(world, centre(world, 0), 'ammo_explosion');
        if (tick === 4) queueIgnition(world, centre(world, 3), 'artillery_impact');
        updateFire(world);
      }
      return {
        cells: [...world.fire.cells.entries()],
        fireRevision: world.fire.revision,
        terrainIds: Array.from(
          { length: world.terrain.width },
          (_, column) => world.terrain.idAt(column, 0),
        ),
        terrainRevision: world.terrain.revision,
        rng: world.rng.save(),
        events: [...world.events],
        result: toResult(world, 'scripted-fire-replay', 100),
      };
    };

    expect(run()).toEqual(run());
  });

  it('favours downwind neighbours and honours the concurrent-fire cap', () => {
    const downwind = fireWorld('wind-spread');
    configureFire(downwind, { baseSpreadChance: 0, windSpreadChance: 1 });
    downwind.atmosphere = {
      ...downwind.atmosphere,
      mechanics: { ...downwind.atmosphere.mechanics, wind: { x: 1, y: 0 } },
    };
    burningAt(downwind, 1);

    updateFire(downwind);

    expect(downwind.fire.cells.has(0)).toBe(false);
    expect(downwind.fire.cells.get(2)?.phase).toBe('burning');

    const capped = fireWorld('fire-cap');
    configureFire(capped, {
      maxBurningTiles: 2,
      ignitionChance: { ammoExplosion: 1 },
    });
    for (const cell of [2, 0, 1]) queueIgnition(capped, centre(capped, cell), 'ammo_explosion');
    updateFire(capped);
    expect([...capped.fire.cells.keys()]).toEqual([0, 1]);
  });

  it('heats grounded, operational mechs including shutdown and downed hulls', () => {
    const world = fireWorld('fire-heat', ['f']);
    configureFire(world, { heatPerSecond: 6, baseSpreadChance: 0, windSpreadChance: 0 });
    const active = world.entities.slice(0, 3);
    if (active.length < 3) throw new Error('need three heat fixtures');
    for (const entity of world.entities) entity.destroyed = !active.includes(entity);
    for (const entity of active) {
      entity.pos = centre(world, 0);
      entity.heat = 0;
    }
    const grounded = active[0]!;
    const downed = active[1]!;
    const airborne = active[2]!;
    grounded.shutdownRemaining = 2;
    downed.downRemaining = 2;
    airborne.jump = { from: airborne.pos, to: airborne.pos, elapsed: 0, duration: 1 };
    burningAt(world, 0);

    updateFire(world);

    expect(grounded.heat).toBeCloseTo(0.3);
    expect(downed.heat).toBeCloseTo(0.3);
    expect(airborne.heat).toBe(0);
  });

  it('invalidates optical footprints when a burning treeline opens', () => {
    const world = fireWorld('fire-vision', ['.ff.']);
    const observer = unitOf(world, 'hornet_spotter');
    const target = world.entities.find((entity) => entity.team !== observer.team);
    if (target === undefined || world.vision === null) throw new Error('need opposing fixtures');
    for (const entity of world.entities) entity.destroyed = entity !== observer && entity !== target;
    observer.pos = centre(world, 0);
    target.pos = centre(world, 3);
    observer.sightRange = 1_000;

    updateVision(world, world.vision);
    const before = world.vision.opticalFootprints.get(observer.id)?.cells;
    expect(world.vision.visible.has(target.id)).toBe(false);

    expect(world.terrain.replaceTypeAt(1, 0, 'burnt_forest')).toBe(true);
    updateVision(world, world.vision);
    const after = world.vision.opticalFootprints.get(observer.id)?.cells;

    expect(after).not.toBe(before);
    expect(world.vision.visible.has(target.id)).toBe(true);
  });
});
