import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { friendlyOccupancy } from './orderRouting';
import type { World } from './types';

function cellOf(world: World, at: { x: number; y: number }): number {
  const tile = world.terrain.toTile(at);
  return tile.row * world.terrain.width + tile.column;
}

describe('friendly occupancy for routing', () => {
  it('charges the tiles under parked lance-mates and nothing else', () => {
    const world = playerWorld('occupancy');
    const mine = world.entities.filter((entity) => entity.team === 0);
    const [walker, parked, moving, wreck] = mine;
    const hostile = world.entities.find((entity) => entity.team !== 0);
    if (walker === undefined || parked === undefined || moving === undefined || wreck === undefined) {
      throw new Error('need a lance of four');
    }
    if (hostile === undefined) throw new Error('need a hostile');
    parked.underway = false;
    moving.underway = true;
    wreck.underway = false;
    wreck.destroyed = true;
    hostile.underway = false;

    const occupancy = friendlyOccupancy(world, walker);

    expect(occupancy.costFactor).toBe(world.rules.movement.occupiedTileCostFactor);
    expect(occupancy.cells.has(cellOf(world, parked.pos))).toBe(true);
    expect(occupancy.cells.has(cellOf(world, moving.pos))).toBe(false);
    expect(occupancy.cells.has(cellOf(world, wreck.pos))).toBe(false);
    expect(occupancy.cells.has(cellOf(world, hostile.pos))).toBe(false);
    expect(occupancy.cells.has(cellOf(world, walker.pos))).toBe(false);
  });
});
