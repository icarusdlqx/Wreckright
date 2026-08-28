import { describe, expect, it } from 'vitest';
import { catalog, playerWorld, unitOf } from '../../tests/support';
import { AtmosphereSchema, type Atmosphere } from '../schema/atmosphere';
import { effectiveSensorRange, effectiveSightRange, tileVisible, updateVision } from './sensors';
import { spawnUnits } from './triggers';
import { runBattle } from './world';

function atmosphere(id: string): Atmosphere {
  const value = catalog.atmospheres.get(id);
  if (value === undefined) throw new Error(`missing atmosphere "${id}"`);
  return value;
}

describe('weather authoring safeguards', () => {
  it('rejects out-of-range mechanics and stray fields', () => {
    const base = { id: 'bad_air', name: 'Bad Air' };

    expect(
      AtmosphereSchema.safeParse({ ...base, mechanics: { sensorFactor: 0.49 } }).success,
    ).toBe(false);
    expect(
      AtmosphereSchema.safeParse({ ...base, mechanics: { heatDissipationFactor: 1.51 } }).success,
    ).toBe(false);
    expect(
      AtmosphereSchema.safeParse({ ...base, mechanics: { wind: { x: 1.01 } } }).success,
    ).toBe(false);
    expect(
      AtmosphereSchema.safeParse({ ...base, mechanics: { sensorFactor: 1, typo: 1 } }).success,
    ).toBe(false);
  });
});

describe('weather scope', () => {
  it('applies identical ratios to both sides and late reinforcements', () => {
    const world = playerWorld('weather-spawns');
    world.atmosphere = atmosphere('moonlit_night');
    const originalSides = [
      world.entities.find((entity) => entity.team === 0),
      world.entities.find((entity) => entity.team === 1),
    ];
    if (originalSides.some((entity) => entity === undefined)) throw new Error('need both sides');

    const late = spawnUnits(world, 7, [
      {
        designId: 'wisp_scout',
        pilotId: 'nadia_ostrow',
        spawn: { x: 300, y: 300 },
        facingDegrees: 0,
      },
    ])[0];
    if (late === undefined) throw new Error('late reinforcement failed to spawn');

    for (const entity of [...originalSides, late]) {
      if (entity === undefined) continue;
      expect(effectiveSightRange(world, entity) / entity.sightRange).toBeCloseTo(0.85, 8);
      expect(effectiveSensorRange(world, entity) / entity.sensorRange).toBeCloseTo(0.95, 8);
    }
  });

  it('shrinks the cached visible ground with optical range', () => {
    const world = playerWorld('weather-footprint');
    const observer = unitOf(world, 'hornet_spotter');
    for (const entity of world.entities) {
      if (entity !== observer) entity.destroyed = true;
    }
    observer.pos = { x: 12, y: 12 };
    observer.sightRange = 200;
    const edge = world.terrain.toTile({ x: 204, y: 12 });
    const cell = edge.row * world.terrain.width + edge.column;

    world.atmosphere = atmosphere('hard_noon');
    updateVision(world, world.vision!);
    expect(tileVisible(world.vision, cell)).toBe(true);

    world.atmosphere = atmosphere('moonlit_night');
    updateVision(world, world.vision!);
    expect(tileVisible(world.vision, cell)).toBe(false);
  });
});

describe('weather determinism', () => {
  it('replays a non-neutral atmosphere identically from the same seed', () => {
    const options = {
      seed: 'weather-replay',
      missionId: 'causeway_night',
      maxTicks: 800,
    } as const;

    expect(runBattle(catalog, options)).toEqual(runBattle(catalog, options));
  });
});
