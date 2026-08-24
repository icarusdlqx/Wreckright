import { beforeEach, describe, expect, it } from 'vitest';
import { makeGrid, OPEN_LEGEND, playerWorld, unitOf } from '../../tests/support';
import { availableDps } from './ai/utility';
import { updateWeapons } from './combat';
import { eventsOfType } from './events';
import { speedFor } from './movement';
import { approachToEngage, engageWorthTarget } from './orderTargeting';
import { lineCost } from './pathfind';
import { hitPreview } from './preview';
import { visionFor } from './sensors';
import type { MechEntity, World } from './types';
import { hasUsableFiringSolution } from './weaponEngagement';
import { elevationRangeFactor, weaponMaximumReach } from './weaponRange';

let world: World;
let shooter: MechEntity;
let target: MechEntity;

function flatGrid(): ReturnType<typeof makeGrid> {
  return makeGrid({
    legend: OPEN_LEGEND,
    tiles: Array.from({ length: 4 }, () => '.'.repeat(8)),
    elevation: Array.from({ length: 4 }, () => '0'.repeat(8)),
    tileSize: 100,
  });
}

function ridgeGrid(): ReturnType<typeof makeGrid> {
  return makeGrid({
    legend: OPEN_LEGEND,
    tiles: Array.from({ length: 4 }, () => '.'.repeat(8)),
    elevation: ['00000000', '22000000', '00000000', '00000000'],
    tileSize: 100,
  });
}

function shoulderGrid(): ReturnType<typeof makeGrid> {
  return makeGrid({
    legend: OPEN_LEGEND,
    tiles: Array.from({ length: 4 }, () => '.'.repeat(8)),
    elevation: ['00000000', '11000000', '00000000', '00000000'],
    tileSize: 100,
  });
}

function sightTarget(): void {
  const vision = visionFor(world, shooter.team);
  if (vision === null) throw new Error('need team vision');
  vision.visible.clear();
  vision.visible.add(target.id);
}

beforeEach(() => {
  world = playerWorld('elevation-mechanics');
  shooter = unitOf(world, 'sentinel_brawler');
  const found = world.entities.find((entity) => entity.team !== shooter.team);
  if (found === undefined) throw new Error('need an enemy target');
  target = found;

  for (const entity of world.entities) {
    if (entity !== shooter && entity !== target) entity.destroyed = true;
  }

  shooter.weapons = [{
    index: 0,
    weaponId: 'medium_laser',
    location: 'centre_torso',
    group: 1,
    cooldown: 0,
    destroyed: false,
  }];
  shooter.ammoBins = [];
  shooter.groupIntent = [true, true, true, true];
  shooter.groupEnabled = [true, true, true, true];
  shooter.facing = 0;
  shooter.torsoOffset = 0;
  shooter.motion = 'stationary';
  shooter.intendedMotion = 'stationary';
  shooter.sightRange = 2_000;
  target.motion = 'stationary';
  target.pos = { x: 290, y: 150 };
  sightTarget();
});

describe('high-ground movement', () => {
  it('slows a mech crossing a plateau with the authored capped factor', () => {
    world.terrain = makeGrid({
      legend: OPEN_LEGEND,
      tiles: Array.from({ length: 4 }, () => '....'),
      elevation: Array.from({ length: 4 }, () => '2200'),
      tileSize: 100,
    });
    shooter.motion = 'walk';
    shooter.facing = Math.PI / 2;

    shooter.pos = { x: 50, y: 150 };
    const high = speedFor(world, shooter);
    shooter.pos = { x: 350, y: 150 };
    const low = speedFor(world, shooter);

    expect(high / low).toBeCloseTo(world.rules.movement.elevationSpeedPerLevel ** 2, 8);
  });

  it('charges the same plateau penalty to the route planner', () => {
    const flat = makeGrid({
      legend: OPEN_LEGEND,
      tiles: ['......'],
      elevation: ['000000'],
      tileSize: 100,
    });
    const high = makeGrid({
      legend: OPEN_LEGEND,
      tiles: ['......'],
      elevation: ['222222'],
      tileSize: 100,
    });
    const from = { x: 50, y: 50 };
    const to = { x: 550, y: 50 };
    const flatCost = lineCost(flat, from, to);
    const highCost = lineCost(high, from, to);

    expect(flatCost).not.toBeNull();
    expect(highCost).not.toBeNull();
    expect((highCost ?? 0) / (flatCost ?? 1)).toBeCloseTo(
      1 / world.rules.movement.elevationSpeedPerLevel ** 2,
      8,
    );
  });

  it('limps at the canonical one-leg pace before reinforced actuators help', () => {
    world.terrain = flatGrid();
    shooter.pos = { x: 150, y: 150 };
    shooter.motion = 'walk';
    const whole = speedFor(world, shooter);
    shooter.locations.left_leg.destroyed = true;
    const limping = speedFor(world, shooter);
    const expected = Math.min(
      1,
      world.rules.movement.singleLegSpeedFactor * shooter.legLossFactor,
    );

    expect(world.rules.movement.singleLegSpeedFactor).toBe(0.32);
    expect(limping / whole).toBeCloseTo(expected, 8);
  });
});

describe('downhill weapon reach', () => {
  it('extends and caps only the usable maximum reach', () => {
    const gun = world.catalog.weapons.get('medium_laser');
    if (gun === undefined) throw new Error('need medium laser');
    world.terrain = ridgeGrid();
    shooter.pos = { x: 50, y: 150 };

    const factor = elevationRangeFactor(world, gun, shooter.pos, target.pos);
    expect(factor).toBeCloseTo(world.rules.combat.elevation.rangeMaxFactor, 8);
    expect(weaponMaximumReach(world, gun, shooter.pos, target.pos)).toBeCloseTo(
      gun.range.long * world.rules.combat.maxRangeMultiplier * factor,
      8,
    );
    expect(elevationRangeFactor(world, gun, target.pos, shooter.pos)).toBe(1);
  });

  it('reserves extra reach for true hills and direct-fire weapons', () => {
    const direct = world.catalog.weapons.get('medium_laser');
    const indirect = world.catalog.weapons.get('lrm10');
    if (direct === undefined || indirect === undefined) throw new Error('need range fixtures');
    shooter.pos = { x: 50, y: 150 };

    world.terrain = shoulderGrid();
    expect(world.rules.combat.elevation.rangeMinimumLevels).toBe(2);
    expect(elevationRangeFactor(world, direct, shooter.pos, target.pos)).toBe(1);

    world.terrain = ridgeGrid();
    expect(indirect.tags).toContain('indirect_fire');
    expect(elevationRangeFactor(world, indirect, shooter.pos, target.pos)).toBe(1);
    expect(elevationRangeFactor(world, direct, shooter.pos, target.pos)).toBeGreaterThan(1);
  });

  it('keeps firing, preview and attack-move orders on the same envelope', () => {
    const range = target.pos.x - 50;
    world.terrain = flatGrid();
    shooter.pos = { x: 50, y: 150 };
    sightTarget();

    expect(hasUsableFiringSolution(world, shooter, target, 'intent')).toBe(false);
    expect(hitPreview(world, shooter, target)?.weapons[0]?.blocked).toBe('range');
    expect(engageWorthTarget(world, shooter)).toBeNull();
    shooter.targetId = target.id;
    updateWeapons(world, shooter);
    expect(eventsOfType(world.events, 'weapon_fired')).toHaveLength(0);

    world.terrain = ridgeGrid();
    shooter.weapons[0]!.cooldown = 0;
    world.events.length = 0;
    sightTarget();

    expect(range).toBeGreaterThan(
      (world.catalog.weapons.get('medium_laser')?.range.long ?? 0)
        * world.rules.combat.maxRangeMultiplier,
    );
    expect(hasUsableFiringSolution(world, shooter, target, 'intent')).toBe(true);
    expect(hitPreview(world, shooter, target)?.weapons[0]?.blocked).toBeNull();
    expect(engageWorthTarget(world, shooter)?.id).toBe(target.id);
    updateWeapons(world, shooter);
    expect(eventsOfType(world.events, 'weapon_fired')).toHaveLength(1);
  });

  it('lets an attack order and tactical candidate exploit a ridge without inventing range', () => {
    world.terrain = ridgeGrid();
    shooter.pos = { x: 50, y: 150 };
    target.pos = { x: 215, y: 150 };
    sightTarget();
    expect(approachToEngage(world, shooter, target)).toBe(false);

    world.terrain = flatGrid();
    expect(approachToEngage(world, shooter, target)).toBe(true);

    world.terrain = ridgeGrid();
    const perch = { x: 50, y: 150 };
    target.pos = { x: 290, y: 150 };
    shooter.pos = { x: 50, y: 250 };
    sightTarget();
    const range = Math.hypot(target.pos.x - perch.x, target.pos.y - perch.y);
    const high = availableDps(world, shooter, target, range, perch);

    world.terrain = flatGrid();
    const flat = availableDps(world, shooter, target, range, perch);
    expect(high).toBeGreaterThan(0);
    expect(flat).toBe(0);
  });
});
