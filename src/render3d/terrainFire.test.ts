import { Matrix4, MeshLambertMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { catalog } from '../../tests/support';
import type { TerrainMapData } from '../schema/map';
import type { TeamVision } from '../sim/sensors';
import { createTerrainGrid, type TerrainGrid } from '../sim/terrain';
import {
  TerrainFireLayer,
  type FirePresentationWorld,
  type TerrainFireStats,
} from './terrainFire';

function fixture(): { data: TerrainMapData; grid: TerrainGrid } {
  const data = catalog.maps.get('ridge_pass');
  if (data === undefined) throw new Error('missing ridge pass fixture');
  return { data, grid: createTerrainGrid(data, catalog.rules.terrain) };
}

function vision(cells: number): TeamVision {
  return {
    team: 0,
    visible: new Set(),
    identified: new Set(),
    detected: new Set(),
    tracks: new Map(),
    observedHulks: new Set(),
    ghosts: new Map(),
    tiles: new Uint8Array(cells),
    explored: new Uint8Array(cells),
    opticalFootprints: new Map(),
  };
}

function view(currentVision: TeamVision | null): FirePresentationWorld {
  return { tick: 0, vision: currentVision, fire: { cells: new Map() } };
}

function burning(startedTick = 0, burnoutTick = 100) {
  return { phase: 'burning' as const, startedTick, burnoutTick, nextSpreadTick: 20 };
}

function burnt() {
  return { phase: 'burnt' as const, startedTick: 0, burnoutTick: 20, nextSpreadTick: 20 };
}

function matrices(stats: TerrainFireStats, pool: 'flame' | 'smoke' | 'scorch'): number[] {
  return Array.from(stats.pools[pool].instances.array);
}

function translation(
  stats: TerrainFireStats,
  pool: 'flame' | 'smoke',
  slot = 0,
): { x: number; y: number; z: number } {
  const array = stats.pools[pool].instances.array;
  const offset = slot * 16;
  return {
    x: Number(array[offset + 12]),
    y: Number(array[offset + 13]),
    z: Number(array[offset + 14]),
  };
}

function firstForest(data: TerrainMapData): number {
  for (let row = 0; row < data.height; row += 1) {
    for (let column = 0; column < data.width; column += 1) {
      const symbol = data.tiles[row]?.[column] ?? '';
      if (data.legend[symbol] === 'forest') return row * data.width + column;
    }
  }
  throw new Error('fixture has no forest');
}

describe('TerrainFireLayer pools', () => {
  it('keeps three fixed resources and buffer identities from one fire through saturation', () => {
    const { data, grid } = fixture();
    const currentVision = vision(grid.width * grid.height);
    currentVision.tiles.fill(1);
    const world = view(currentVision);
    const layer = new TerrainFireLayer(grid, data, () => 0);
    const empty = layer.stats();
    const emptyVersions = {
      flame: empty.pools.flame.instances.version,
      smoke: empty.pools.smoke.instances.version,
    };
    layer.draw(world, 1);
    expect(layer.stats().resourcePools).toBe(3);
    expect(layer.stats().activeDrawCalls).toBe(0);
    expect(layer.stats().pools.flame.mesh.count).toBe(0);
    expect(layer.stats().pools.smoke.mesh.count).toBe(0);
    expect(layer.stats().pools.flame.instances.version).toBe(emptyVersions.flame);
    expect(layer.stats().pools.smoke.instances.version).toBe(emptyVersions.smoke);
    world.fire.cells.set(0, burning());
    layer.draw(world, 0.05);
    const one = layer.stats();

    expect(one.activeDrawCalls).toBe(2);
    expect(one.pools.flame.active).toBe(1);
    expect(one.pools.smoke.active).toBe(3);
    expect(one.pools.flame.material.depthTest).toBe(true);
    expect(one.pools.smoke.material.depthTest).toBe(true);
    for (let cell = 1; cell < 180; cell += 1) world.fire.cells.set(cell, burning());
    layer.draw(world, 0.05);
    const saturated = layer.stats();

    expect(saturated.activeDrawCalls).toBe(2);
    expect(saturated.pools.flame.active).toBe(128);
    expect(saturated.pools.smoke.active).toBe(384);
    for (const pool of ['flame', 'smoke', 'scorch'] as const) {
      expect(saturated.pools[pool].mesh).toBe(one.pools[pool].mesh);
      expect(saturated.pools[pool].geometry).toBe(one.pools[pool].geometry);
      expect(saturated.pools[pool].material).toBe(one.pools[pool].material);
      expect(saturated.pools[pool].instances).toBe(one.pools[pool].instances);
      expect(saturated.pools[pool].instances.array).toHaveLength(
        saturated.pools[pool].capacity * 16,
      );
    }
    expect(saturated.pools.flame.mesh.count).toBe(128);
    expect(saturated.pools.smoke.mesh.count).toBe(384);
  });

  it('contracts active counts without stale uploads when the last fire expires', () => {
    const { data, grid } = fixture();
    const currentVision = vision(grid.width * grid.height);
    currentVision.tiles.fill(1);
    const world = view(currentVision);
    const layer = new TerrainFireLayer(grid, data, () => 0);
    world.fire.cells.set(0, burning());
    world.fire.cells.set(1, burning());
    layer.draw(world, 0.1);
    const active = layer.stats();
    const versions = {
      flame: active.pools.flame.instances.version,
      smoke: active.pools.smoke.instances.version,
    };

    world.fire.cells.delete(1);
    layer.draw(world, 0);
    expect(layer.stats().pools.flame.mesh.count).toBe(1);
    expect(layer.stats().pools.smoke.mesh.count).toBe(3);
    expect(layer.stats().pools.flame.instances.version).toBe(versions.flame);
    expect(layer.stats().pools.smoke.instances.version).toBe(versions.smoke);

    world.fire.cells.clear();
    layer.draw(world, 0);
    const expired = layer.stats();
    expect(expired.pools.flame.mesh.count).toBe(0);
    expect(expired.pools.smoke.mesh.count).toBe(0);
    expect(expired.activeDrawCalls).toBe(0);
    expect(expired.pools.flame.instances.version).toBe(versions.flame);
    expect(expired.pools.smoke.instances.version).toBe(versions.smoke);
    layer.draw(world, 1);
    expect(layer.stats().pools.flame.instances.version).toBe(versions.flame);
    expect(layer.stats().pools.smoke.instances.version).toBe(versions.smoke);
  });

  it('uses authoritative burn progress for smoke density and low-FX thinning', () => {
    const { data, grid } = fixture();
    const currentVision = vision(grid.width * grid.height);
    currentVision.tiles[0] = 1;
    const world = view(currentVision);
    world.fire.cells.set(0, burning());
    const layer = new TerrainFireLayer(grid, data, () => 0);

    world.tick = 0;
    layer.draw(world, 0);
    expect(layer.stats().pools.smoke.active).toBe(3);
    world.tick = 50;
    layer.draw(world, 0);
    expect(layer.stats().pools.smoke.active).toBe(2);
    world.tick = 80;
    layer.draw(world, 0);
    expect(layer.stats().pools.smoke.active).toBe(1);
    world.tick = 0;
    layer.setPresentationMode(true);
    layer.draw(world, 0);
    expect(layer.stats().pools.smoke.active).toBe(1);
  });

  it('freezes at pause and in reduced motion while normal presentation moves', () => {
    const { data, grid } = fixture();
    const currentVision = vision(grid.width * grid.height);
    currentVision.tiles[0] = 1;
    const world = view(currentVision);
    world.fire.cells.set(0, burning());
    const layer = new TerrainFireLayer(grid, data, () => 0);

    layer.draw(world, 0.1);
    const paused = matrices(layer.stats(), 'smoke');
    const pausedVersion = layer.stats().pools.smoke.instances.version;
    layer.draw(world, 0);
    expect(matrices(layer.stats(), 'smoke')).toEqual(paused);
    expect(layer.stats().pools.smoke.instances.version).toBe(pausedVersion);
    layer.draw(world, 0.2);
    expect(matrices(layer.stats(), 'smoke')).not.toEqual(paused);
    expect(layer.stats().pools.smoke.instances.version).toBeGreaterThan(pausedVersion);

    layer.setPresentationMode(false, true);
    layer.draw(world, 0.1);
    const reduced = matrices(layer.stats(), 'smoke');
    const reducedVersion = layer.stats().pools.smoke.instances.version;
    layer.draw(world, 2);
    expect(matrices(layer.stats(), 'smoke')).toEqual(reduced);
    expect(layer.stats().pools.smoke.instances.version).toBe(reducedVersion);
  });

  it('places the same fire matrices for the same state and presentation time', () => {
    const { data, grid } = fixture();
    const currentVision = vision(grid.width * grid.height);
    currentVision.tiles.fill(1);
    const world = view(currentVision);
    world.fire.cells.set(17, burning());
    world.fire.cells.set(93, burning());
    const first = new TerrainFireLayer(grid, data, (x, z) => (x - z) / 1_000);
    const second = new TerrainFireLayer(grid, data, (x, z) => (x - z) / 1_000);

    first.draw(world, 0.35);
    second.draw(world, 0.35);

    expect(matrices(first.stats(), 'flame')).toEqual(matrices(second.stats(), 'flame'));
    expect(matrices(first.stats(), 'smoke')).toEqual(matrices(second.stats(), 'smoke'));
  });

  it('anchors flame and smoke deterministically inside the source tile away from its centre', () => {
    const { data, grid } = fixture();
    const sources = [
      { column: 26, row: 13 },
      { column: 27, row: 13 },
    ];
    const currentVision = vision(grid.width * grid.height);
    const world = view(currentVision);
    for (const source of sources) {
      const cell = source.row * grid.width + source.column;
      currentVision.tiles[cell] = 1;
      world.fire.cells.set(cell, burning());
    }
    const first = new TerrainFireLayer(grid, data, () => 0, true);
    const second = new TerrainFireLayer(grid, data, () => 0, true);

    first.draw(world, 0);
    second.draw(world, 0);
    const stats = first.stats();
    const insideTile = (
      point: { x: number; z: number },
      source: { column: number; row: number },
    ): void => {
      expect(point.x).toBeGreaterThan(source.column * grid.tileSize);
      expect(point.x).toBeLessThan((source.column + 1) * grid.tileSize);
      expect(point.z).toBeGreaterThan(source.row * grid.tileSize);
      expect(point.z).toBeLessThan((source.row + 1) * grid.tileSize);
    };

    for (let sourceSlot = 0; sourceSlot < sources.length; sourceSlot += 1) {
      const source = sources[sourceSlot];
      if (source === undefined) throw new Error('missing fire source fixture');
      const centre = {
        x: (source.column + 0.5) * grid.tileSize,
        z: (source.row + 0.5) * grid.tileSize,
      };
      const flame = translation(stats, 'flame', sourceSlot);
      insideTile(flame, source);
      expect(flame.x).not.toBe(centre.x);
      expect(flame.z).not.toBe(centre.z);
      expect(Math.sign(flame.x - centre.x)).toBe(sourceSlot === 0 ? 1 : -1);
      expect(flame.y).toBeCloseTo(2.25, 5);
      for (let puff = 0; puff < 3; puff += 1) {
        insideTile(translation(stats, 'smoke', sourceSlot * 3 + puff), source);
      }
    }
    expect(matrices(stats, 'flame')).toEqual(matrices(second.stats(), 'flame'));
    expect(matrices(stats, 'smoke')).toEqual(matrices(second.stats(), 'smoke'));

    const smoke = stats.pools.smoke.material as MeshLambertMaterial;
    expect(smoke.color.getHex()).toBe(0x697078);
    expect(smoke.opacity).toBe(0.52);
  });
});

describe('TerrainFireLayer privacy and lifecycle', () => {
  it('shows live fire only under current optics and remembers only observed scorch', () => {
    const { data, grid } = fixture();
    const cell = firstForest(data);
    const currentVision = vision(grid.width * grid.height);
    const world = view(currentVision);
    const layer = new TerrainFireLayer(grid, data, () => 0);
    world.fire.cells.set(cell, burning());

    layer.draw(world, 0);
    expect(layer.stats().pools.flame.active).toBe(0);
    currentVision.tiles[cell] = 1;
    layer.draw(world, 0);
    expect(layer.stats().pools.flame.active).toBe(1);
    currentVision.tiles[cell] = 0;
    world.fire.cells.set(cell, burnt());
    layer.draw(world, 0);
    expect(layer.stats().pools.scorch.active).toBe(0);
    currentVision.tiles[cell] = 1;
    layer.draw(world, 0);
    expect(layer.stats().pools.scorch.active).toBe(1);
    currentVision.tiles[cell] = 0;
    world.fire.cells.clear();
    layer.draw(world, 0);
    expect(layer.stats().pools.scorch.active).toBe(1);
  });

  it('disposes each pooled resource once and ignores later draws', () => {
    const { data, grid } = fixture();
    const world = view(null);
    world.fire.cells.set(0, burning());
    const layer = new TerrainFireLayer(grid, data, () => 0);
    const before = layer.stats();
    const disposed = {
      meshes: vi.fn(),
      geometries: vi.fn(),
      materials: vi.fn(),
    };
    for (const pool of Object.values(before.pools)) {
      pool.mesh.addEventListener('dispose', disposed.meshes);
      pool.geometry.addEventListener('dispose', disposed.geometries);
      pool.material.addEventListener('dispose', disposed.materials);
    }

    layer.dispose();
    layer.dispose();
    layer.draw(world, 1);

    expect(disposed.meshes).toHaveBeenCalledTimes(3);
    expect(disposed.geometries).toHaveBeenCalledTimes(3);
    expect(disposed.materials).toHaveBeenCalledTimes(3);
    expect(layer.group.children).toHaveLength(0);
    expect(layer.stats().disposed).toBe(true);
    expect(layer.stats().resourcePools).toBe(0);
    expect(layer.stats().activeDrawCalls).toBe(0);
  });

  it('uses one fixed scorch slot for every initially burnable forest cell', () => {
    const { data, grid } = fixture();
    const forests = data.tiles.reduce((total, row) => total + [...row].filter((symbol) =>
      data.legend[symbol] === 'forest').length, 0);
    const layer = new TerrainFireLayer(grid, data, () => 0);

    expect(layer.stats().pools.scorch.capacity).toBe(forests);
    expect(layer.stats().pools.scorch.mesh.geometry.type).toBe('CircleGeometry');
    const matrix = new Matrix4();
    layer.stats().pools.scorch.mesh.getMatrixAt(0, matrix);
    expect(matrix.getMaxScaleOnAxis()).toBe(0);
  });
});
