import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { findPath } from '../sim/pathfind';
import { createTerrainGrid } from '../sim/terrain';

const lineRoutes = {
  line_workshop_belt: [
    [[24, 44], [16, 5]],
    [[24, 44], [32, 10]],
    [[39, 44], [39, 6]],
  ],
  line_recovery_cut: [
    [[38, 44], [22, 9]],
    [[38, 44], [22, 25]],
    [[38, 44], [10, 25]],
  ],
} as const;

describe('campaign authored map packs', () => {
  it.each(Object.entries(lineRoutes))('%s keeps its planned approaches connected', (id, routes) => {
    const map = catalog.maps.get(id);
    expect(map, id).toBeDefined();
    const grid = createTerrainGrid(map!, catalog.rules.terrain, catalog.rules.movement);
    for (const [[sx, sy], [gx, gy]] of routes) {
      const path = findPath(grid, grid.tileCentre(sx, sy), grid.tileCentre(gx, gy), catalog.rules.simulation.pathfindMaxNodes);
      expect(path?.length, `${id}: ${sx},${sy} to ${gx},${gy}`).toBeGreaterThan(1);
    }
  });

  it.each(Object.keys(lineRoutes))('%s leaves broad staging and objective courts for heavy machines', (id) => {
    const map = catalog.maps.get(id)!;
    const grid = createTerrainGrid(map, catalog.rules.terrain, catalog.rules.movement);
    let broad = 0;
    for (let row = 2; row < grid.height - 2; row += 1) for (let column = 2; column < grid.width - 2; column += 1) {
      if ([-1, 0, 1].every(dx => [-1, 0, 1].every(dy => grid.passable(column + dx, row + dy)))) broad += 1;
    }
    expect(broad).toBeGreaterThan(350);
  });
});
