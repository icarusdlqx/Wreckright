import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { bodyRadius, separateBodies } from './collision';
import { hitChance } from './combat';
import { distance } from './math';
import { updateMovement } from './movement';
import type { MechEntity, World } from './types';
import { stepWorld } from './world';

/**
 * Open ground with room on every side, so a shove always has somewhere to go
 * and terrain is never what separated two mechs.
 */
function openGround(world: World): { x: number; y: number } {
  const { terrain } = world;
  for (let row = 3; row < terrain.height - 3; row += 1) {
    for (let column = 3; column < terrain.width - 3; column += 1) {
      if (terrain.typeAt(column, row).moveMultiplier < 1) continue;
      const clear = [-2, -1, 0, 1, 2].every((dx) =>
        [-2, -1, 0, 1, 2].every((dy) => terrain.passable(column + dx, row + dy)),
      );
      if (clear) return terrain.tileCentre(column, row);
    }
  }
  throw new Error('this map has no open ground to test contact in');
}

function pair(world: World): [MechEntity, MechEntity] {
  const [a, b] = world.entities;
  if (a === undefined || b === undefined) throw new Error('need two mechs');
  return [a, b];
}

describe('body separation', () => {
  it('pushes two mechs standing in the same spot apart', () => {
    const world = playerWorld('contact');
    const [a, b] = pair(world);
    const spot = openGround(world);
    a.pos = { ...spot };
    b.pos = { ...spot };

    for (let tick = 0; tick < 80; tick += 1) separateBodies(world);

    expect(distance(a.pos, b.pos)).toBeGreaterThan(
      (bodyRadius(world, a) + bodyRadius(world, b)) * 0.95,
    );
  });

  it('clears a same-team three-mech pile-up within two seconds', () => {
    const world = playerWorld('lance-pile-up');
    const lance = world.entities.filter((entity) => entity.team === 0).slice(0, 3);
    if (lance.length !== 3) throw new Error('need a three-mech lance');
    const spot = openGround(world);
    for (const entity of lance) entity.pos = { ...spot };

    for (let tick = 0; tick < world.rules.simulation.tickRate * 2; tick += 1) {
      separateBodies(world);
    }

    for (let index = 0; index < lance.length; index += 1) {
      for (let other = index + 1; other < lance.length; other += 1) {
        const a = lance[index];
        const b = lance[other];
        if (a === undefined || b === undefined) continue;
        const clearance = bodyRadius(world, a) + bodyRadius(world, b);
        expect(distance(a.pos, b.pos)).toBeGreaterThan(clearance * 0.95);
      }
    }
  });

  it('gives a jump landing deep beside a lancemate a second bounded shove', () => {
    const world = playerWorld('deep-lancemate-landing');
    const [a, b] = pair(world);
    const spot = openGround(world);
    const clearance = bodyRadius(world, a) + bodyRadius(world, b);
    const tolerance = world.rules.movement.arrivalRadius;
    const landing = { x: spot.x + clearance - tolerance * 3, y: spot.y };
    a.pos = { x: spot.x - a.jumpRange, y: spot.y };
    a.jump = {
      from: { ...a.pos },
      to: landing,
      elapsed: 0,
      duration: world.dt,
    };
    b.pos = { ...spot };

    updateMovement(world, a);

    separateBodies(world);

    expect(a.jump).toBeNull();
    expect(clearance - distance(a.pos, b.pos)).toBeLessThanOrEqual(tolerance);
  });

  it('gives ground with the lighter mech', () => {
    const world = playerWorld('mass');
    const [a, b] = pair(world);
    const spot = openGround(world);
    a.tonnage = 100;
    b.tonnage = 25;
    a.pos = { x: spot.x, y: spot.y };
    b.pos = { x: spot.x + 4, y: spot.y };

    const heavyFrom = { ...a.pos };
    const lightFrom = { ...b.pos };
    separateBodies(world);

    expect(distance(b.pos, lightFrom)).toBeGreaterThan(distance(a.pos, heavyFrom) * 2);
  });

  it('counts a shove as movement for animation and accuracy', () => {
    const world = playerWorld('shove-motion');
    const [shooter, anchor] = pair(world);
    const spot = openGround(world);
    shooter.pos = { ...spot };
    anchor.pos = { x: spot.x + 2, y: spot.y };
    shooter.motion = 'stationary';
    anchor.motion = 'stationary';
    anchor.mobile = false;
    const weapon = world.catalog.weapons.get(shooter.weapons[0]?.weaponId ?? '');
    if (weapon === undefined) throw new Error('shooter has no weapon');
    const before = hitChance(world, shooter, anchor, weapon, 100);

    separateBodies(world);

    expect(shooter.motion).toBe('walk');
    expect(anchor.motion).toBe('stationary');
    expect(hitChance(world, shooter, anchor, weapon, 100)).toBeLessThan(before);
  });

  it('does not animate an imperceptible separation tail as walking', () => {
    const world = playerWorld('micro-shove-motion');
    const [shooter, anchor] = pair(world);
    const spot = openGround(world);
    const clearance = bodyRadius(world, shooter) + bodyRadius(world, anchor);
    shooter.pos = { ...spot };
    anchor.pos = { x: spot.x + clearance - 1e-7, y: spot.y };
    shooter.motion = 'stationary';
    anchor.motion = 'stationary';
    anchor.mobile = false;
    const before = { ...shooter.pos };

    separateBodies(world);

    expect(shooter.pos).toEqual(before);
    expect(shooter.motion).toBe('stationary');
  });

  it('reports stationary when a shove cancels this tick\'s movement', () => {
    const world = playerWorld('cancelled-by-shove');
    const [shooter, anchor] = pair(world);
    const spot = openGround(world);
    const clearance = bodyRadius(world, shooter) + bodyRadius(world, anchor);
    shooter.pos = { ...spot };
    anchor.pos = { x: spot.x + clearance - 1, y: spot.y };
    shooter.motion = 'walk';
    anchor.mobile = false;
    const tickStart = { x: spot.x - 0.5, y: spot.y };

    separateBodies(world, new Map([[shooter.id, tickStart]]));

    expect(shooter.pos.x).toBeCloseTo(tickStart.x, 6);
    expect(shooter.motion).toBe('stationary');
  });

  it('never shoves a mech into ground it cannot stand on', () => {
    const world = playerWorld('walls');
    const [a, b] = pair(world);
    const { terrain } = world;

    let tested = 0;
    for (let row = 1; row < terrain.height - 1 && tested < 3; row += 1) {
      for (let column = 1; column < terrain.width - 1 && tested < 3; column += 1) {
        if (!terrain.passable(column, row) || terrain.passable(column + 1, row)) continue;
        const centre = terrain.tileCentre(column, row);
        a.pos = { ...centre };
        b.pos = { x: centre.x - 2, y: centre.y };
        for (let tick = 0; tick < 60; tick += 1) separateBodies(world);

        for (const mech of [a, b]) {
          const tile = terrain.toTile(mech.pos);
          expect(terrain.passable(tile.column, tile.row), `${mech.name} pushed into a wall`).toBe(
            true,
          );
        }
        tested += 1;
      }
    }
    expect(tested).toBeGreaterThan(0);
  });

  it('leaves a whole battle with no mech standing inside another', () => {
    const world = playerWorld('battle');
    for (let tick = 0; tick < 1_200 && !world.finished; tick += 1) stepWorld(world, 12_000);

    const standing = world.entities.filter((entity) => !entity.destroyed && entity.jump === null);
    for (let index = 0; index < standing.length; index += 1) {
      for (let other = index + 1; other < standing.length; other += 1) {
        const a = standing[index];
        const b = standing[other];
        if (a === undefined || b === undefined) continue;
        // Contact is resolved as a shove over a few ticks, so touching is
        // allowed — one hull sitting in the middle of another is not.
        const clearance = (bodyRadius(world, a) + bodyRadius(world, b)) * 0.6;
        expect(distance(a.pos, b.pos), `${a.name} standing inside ${b.name}`).toBeGreaterThan(
          clearance,
        );
      }
    }
  });
});
