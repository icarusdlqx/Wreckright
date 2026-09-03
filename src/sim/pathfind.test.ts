import { describe, expect, it } from 'vitest';
import { catalog, makeGrid, OPEN_LEGEND } from '../../tests/support';
import { findPath, lineCost, nearestPassable } from './pathfind';
import { createTerrainGrid } from './terrain';

const MAX_NODES = 4000;

describe('findPath', () => {
  const maze = makeGrid({
    legend: OPEN_LEGEND,
    tiles: ['.....', '.###.', '.....', '.###.', '.....'],
  });

  it('reaches the goal without crossing impassable tiles', () => {
    const path = findPath(maze, { x: 5, y: 5 }, { x: 45, y: 45 }, MAX_NODES);
    expect(path).not.toBeNull();

    for (const waypoint of path ?? []) {
      const tile = maze.toTile(waypoint);
      expect(maze.passable(tile.column, tile.row)).toBe(true);
    }
  });

  it('is deterministic', () => {
    const first = findPath(maze, { x: 5, y: 5 }, { x: 45, y: 45 }, MAX_NODES);
    const second = findPath(maze, { x: 5, y: 5 }, { x: 45, y: 45 }, MAX_NODES);
    expect(first).toEqual(second);
  });

  it('does not charge stale heap entries to the Blackglass node budget', () => {
    const map = catalog.maps.get('blackglass_quarry');
    if (map === undefined) throw new Error('missing blackglass_quarry');
    const grid = createTerrainGrid(map, catalog.rules.terrain, catalog.rules.movement);
    const goal = { x: 1284, y: 1236 };

    const path = findPath(grid, { x: 108, y: 84 }, goal, 4000);

    expect(path).not.toBeNull();
    expect(path?.at(-1)).toEqual(goal);
  });

  it('walks the last few metres when start and goal share a tile', () => {
    // A tile is wider than most short orders. Handing back an empty route drew
    // no line, and while the battle is paused nothing ever ran to fill one in,
    // so the order was indistinguishable from a click the game ignored.
    expect(findPath(maze, { x: 2, y: 2 }, { x: 8, y: 8 }, MAX_NODES)).toEqual([{ x: 8, y: 8 }]);
  });

  it('walks to the near bank when the goal is walled off', () => {
    const split = makeGrid({
      legend: OPEN_LEGEND,
      tiles: ['..#..', '..#..', '..#..', '..#..', '..#..'],
    });
    // The far side cannot be reached; the order should still march as close
    // as the ground allows instead of silently doing nothing.
    const path = findPath(split, { x: 5, y: 5 }, { x: 45, y: 5 }, MAX_NODES);
    expect(path).not.toBeNull();
    const last = (path ?? [])[(path ?? []).length - 1];
    expect(last).toBeDefined();
    if (last !== undefined) {
      // Ends on the near side of the wall (column 2 is the wall at x 20-30).
      expect(last.x).toBeLessThan(20);
    }
  });

  it('gives up once the node budget is exhausted', () => {
    const split = makeGrid({
      legend: OPEN_LEGEND,
      tiles: ['..#..', '..#..', '..#..', '..#..', '..#..'],
    });
    expect(findPath(split, { x: 5, y: 5 }, { x: 45, y: 5 }, 2)).toBeNull();
  });

  it('detours onto a road rather than grinding straight through rough', () => {
    const detour = makeGrid({
      legend: { r: 'rough', '=': 'road' },
      tiles: ['=====', 'rrrrr'],
    });

    const path = findPath(detour, { x: 5, y: 15 }, { x: 45, y: 15 }, MAX_NODES);
    expect(path).not.toBeNull();

    const rows = (path ?? []).map((waypoint) => detour.toTile(waypoint).row);
    expect(rows).toContain(0);
  });

  it('ends on the exact goal point when the goal tile is reachable', () => {
    const path = findPath(maze, { x: 5, y: 5 }, { x: 47, y: 43 }, MAX_NODES) ?? [];
    expect(path[path.length - 1]).toEqual({ x: 47, y: 43 });
  });

  it('snaps to a passable tile when the goal tile is impassable', () => {
    const goal = { x: 35, y: 15 };
    expect(maze.passable(maze.toTile(goal).column, maze.toTile(goal).row)).toBe(false);

    const path = findPath(maze, { x: 5, y: 5 }, goal, MAX_NODES) ?? [];
    const last = path[path.length - 1];
    expect(last).toBeDefined();
    expect(last).not.toEqual(goal);

    const tile = maze.toTile(last ?? { x: 0, y: 0 });
    expect(maze.passable(tile.column, tile.row)).toBe(true);
  });
});

describe('nearestPassable', () => {
  const grid = makeGrid({
    legend: OPEN_LEGEND,
    tiles: ['.....', '.###.', '.###.', '.###.', '.....'],
  });

  it('returns the tile itself when already passable', () => {
    expect(nearestPassable(grid, 0, 0, 4)).toEqual({ column: 0, row: 0 });
  });

  it('finds the closest passable neighbour', () => {
    const found = nearestPassable(grid, 2, 2, 4);
    expect(found).not.toBeNull();
    expect(grid.passable(found?.column ?? -1, found?.row ?? -1)).toBe(true);
  });

  it('returns null when nothing is passable within the radius', () => {
    const solid = makeGrid({ legend: OPEN_LEGEND, tiles: ['###', '###', '###'] });
    expect(nearestPassable(solid, 1, 1, 4)).toBeNull();
  });
});

describe('routes through parked lance-mates', () => {
  const corridor = makeGrid({
    legend: OPEN_LEGEND,
    tiles: ['.......', '.......', '.......'],
  });
  const start = { x: 5, y: 15 };
  const goal = { x: 65, y: 15 };
  const parked = 1 * corridor.width + 3;

  it('walks straight through open ground when nobody is in the way', () => {
    const path = findPath(corridor, start, goal, MAX_NODES);
    expect(path).not.toBeNull();
    for (const point of path ?? []) expect(corridor.toTile(point).row).toBe(1);
  });

  it('steps round a tile a stationary friendly is standing on', () => {
    const occupancy = { cells: new Set([parked]), costFactor: 2.5 };
    const path = findPath(corridor, start, goal, MAX_NODES, occupancy);
    expect(path).not.toBeNull();

    const rows = (path ?? []).map((point) => corridor.toTile(point).row);
    expect(rows.some((row) => row !== 1), 'the route never left the parked machine\'s row').toBe(true);
    for (const point of path ?? []) {
      const tile = corridor.toTile(point);
      expect(tile.row * corridor.width + tile.column).not.toBe(parked);
    }
  });

  it('still finds a route when the only way through is occupied', () => {
    const lane = makeGrid({ legend: OPEN_LEGEND, tiles: ['#######', '.......', '#######'] });
    const occupancy = { cells: new Set([1 * lane.width + 3]), costFactor: 2.5 };
    const path = findPath(lane, start, goal, MAX_NODES, occupancy);
    expect(path).not.toBeNull();
    expect(path?.at(-1)).toEqual(goal);
  });

  it('prices the straight line the same way the search did', () => {
    const occupancy = { cells: new Set([parked]), costFactor: 2.5 };
    const clear = lineCost(corridor, start, goal);
    const crowded = lineCost(corridor, start, goal, occupancy);
    expect(clear).not.toBeNull();
    expect(crowded ?? 0).toBeGreaterThan(clear ?? 0);
  });
});
