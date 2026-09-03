import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { updateMovement } from './movement';
import { replacePath } from './pathProgress';
import type { MechEntity, World } from './types';

const DEGREES = Math.PI / 180;

function openGround(world: World): { x: number; y: number } {
  const { terrain } = world;
  for (let row = 4; row < terrain.height - 4; row += 1) {
    for (let column = 4; column < terrain.width - 4; column += 1) {
      if (terrain.typeAt(column, row).moveMultiplier < 1) continue;
      const clear = [-2, -1, 0, 1, 2].every((dx) =>
        [-2, -1, 0, 1, 2].every((dy) => terrain.passable(column + dx, row + dy)),
      );
      if (clear) return terrain.tileCentre(column, row);
    }
  }
  throw new Error('this map has no open ground');
}

/** A walker frozen mid-pivot: the hull cannot turn, so the gate alone decides. */
function walkerOffLine(degrees: number): { world: World; walker: MechEntity } {
  const world = playerWorld(`pivot-${degrees}`);
  const walker = world.entities.find((entity) => entity.team === 0);
  if (walker === undefined) throw new Error('need a player mech');
  walker.pos = openGround(world);
  walker.facing = 0;
  walker.turnRate = 0;
  walker.targetId = null;
  walker.intendedMotion = 'walk';
  replacePath(walker, [
    {
      x: walker.pos.x + Math.cos(degrees * DEGREES) * 120,
      y: walker.pos.y + Math.sin(degrees * DEGREES) * 120,
    },
  ]);
  return { world, walker };
}

describe('the pivot gate', () => {
  it('holds a standing mech until its nose is within the resume angle', () => {
    const { world, walker } = walkerOffLine(75);
    const before = { ...walker.pos };
    walker.underway = false;

    updateMovement(world, walker);

    expect(walker.motion).toBe('stationary');
    expect(walker.pos).toEqual(before);
    expect(walker.underway).toBe(false);
  });

  it('keeps a walking mech walking through the same misalignment', () => {
    const { world, walker } = walkerOffLine(75);
    const before = { ...walker.pos };
    walker.underway = true;

    updateMovement(world, walker);

    expect(walker.motion).toBe('walk');
    expect(walker.pos).not.toEqual(before);
    expect(walker.underway).toBe(true);
  });

  it('stops even a walking mech past the hold angle', () => {
    const { world, walker } = walkerOffLine(95);
    walker.underway = true;

    updateMovement(world, walker);

    expect(walker.motion).toBe('stationary');
    expect(walker.underway).toBe(false);
  });

  it('is data: hold is never tighter than resume', () => {
    const { world } = walkerOffLine(0);
    const { facingHoldDegrees, facingResumeDegrees } = world.rules.movement;
    expect(facingHoldDegrees).toBeGreaterThanOrEqual(facingResumeDegrees);
  });
});
