import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import type { TerrainMapData } from '../schema/map';
import { buildRoadWear } from './roadWear';

const heightAt = (x: number, y: number): number => x * 0.007 - y * 0.003;

function terrainIdAt(data: TerrainMapData, column: number, row: number): string {
  return data.legend[data.tiles[row]?.[column] ?? ''] ?? 'open';
}

function roadTiles(data: TerrainMapData): number {
  let total = 0;
  for (let row = 0; row < data.height; row += 1) {
    for (let column = 0; column < data.width; column += 1) {
      if (terrainIdAt(data, column, row) === 'road') total += 1;
    }
  }
  return total;
}

function fixture(
  source: TerrainMapData,
  id: string,
  tiles: string[],
  legend: Record<string, string> = { '.': 'open', '=': 'road' },
): TerrainMapData {
  const width = tiles[0]?.length ?? 0;
  return {
    ...source,
    id,
    width,
    height: tiles.length,
    legend,
    tiles,
    elevation: tiles.map(() => '0'.repeat(width)),
  };
}

describe('procedural road wear', () => {
  it('rebuilds the same tinted geometry byte for byte', () => {
    const data = catalog.maps.get('ridge_pass');
    expect(data).toBeDefined();
    if (data === undefined) return;
    const tint = { colour: new Color(0xb9cfdf), strength: 0.17 };

    const first = buildRoadWear(data, heightAt, tint);
    const second = buildRoadWear(data, heightAt, tint);

    expect(second).toEqual(first);
    expect(first.positions.length).toBeGreaterThan(0);
    expect(first.colours.length).toBe(first.positions.length);
    expect(first.indices.length).toBe(first.stats.triangles * 3);
  });

  it('adds nothing to a map without road tiles', () => {
    const source = catalog.maps.get('ridge_pass');
    expect(source).toBeDefined();
    if (source === undefined) return;
    const data = fixture(source, 'road_free', [
      '....',
      '....',
      '....',
      '....',
    ], { '.': 'rough' });

    expect(buildRoadWear(data, heightAt, null)).toEqual({
      positions: [],
      colours: [],
      indices: [],
      stats: { roadTiles: 0, centreMarks: 0, edgePatches: 0, cracks: 0, triangles: 0 },
    });
  });

  it('records centre fading, neighbouring edge crumble and sparse cracks', () => {
    const data = catalog.maps.get('ridge_pass');
    expect(data).toBeDefined();
    if (data === undefined) return;
    const wear = buildRoadWear(data, heightAt, null);

    expect(wear.stats.roadTiles).toBe(roadTiles(data));
    expect(wear.stats.centreMarks).toBe(wear.stats.roadTiles);
    expect(wear.stats.edgePatches).toBeGreaterThan(0);
    expect(wear.stats.edgePatches).toBeLessThanOrEqual(wear.stats.roadTiles * 2);
    expect(wear.stats.cracks).toBeGreaterThan(0);
    expect(wear.stats.cracks).toBeLessThan(wear.stats.roadTiles / 2);
    expect(wear.stats.triangles).toBe(
      wear.stats.centreMarks * 2 + wear.stats.edgePatches + wear.stats.cracks * 2,
    );
    const uniqueColours = new Set<string>();
    for (let index = 0; index < wear.colours.length; index += 3) {
      uniqueColours.add(wear.colours.slice(index, index + 3).join(':'));
    }
    expect(uniqueColours.size).toBeGreaterThan(4);
  });

  it('keeps every mark over its source road and below the fog skin', () => {
    const data = catalog.maps.get('causeway');
    expect(data).toBeDefined();
    if (data === undefined) return;
    const wear = buildRoadWear(data, heightAt, null);

    for (let vertex = 0; vertex < wear.positions.length / 3; vertex += 1) {
      const x = wear.positions[vertex * 3] ?? Number.NaN;
      const y = wear.positions[vertex * 3 + 1] ?? Number.NaN;
      const z = wear.positions[vertex * 3 + 2] ?? Number.NaN;
      const column = Math.floor(x / data.tileSize);
      const row = Math.floor(z / data.tileSize);
      expect(terrainIdAt(data, column, row), `${column}:${row}`).toBe('road');
      const lift = y - heightAt(x, z);
      expect(lift).toBeGreaterThanOrEqual(0.119999);
      expect(lift).toBeLessThan(0.6);
    }
    expect(Math.min(...wear.indices)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...wear.indices)).toBeLessThan(wear.positions.length / 3);
    let minimumUpwardArea = Number.POSITIVE_INFINITY;
    for (let triangle = 0; triangle < wear.indices.length; triangle += 3) {
      const a = wear.indices[triangle] ?? 0;
      const b = wear.indices[triangle + 1] ?? 0;
      const c = wear.indices[triangle + 2] ?? 0;
      const ax = wear.positions[a * 3] ?? 0;
      const az = wear.positions[a * 3 + 2] ?? 0;
      const bx = wear.positions[b * 3] ?? 0;
      const bz = wear.positions[b * 3 + 2] ?? 0;
      const cx = wear.positions[c * 3] ?? 0;
      const cz = wear.positions[c * 3 + 2] ?? 0;
      minimumUpwardArea = Math.min(
        minimumUpwardArea,
        (bz - az) * (cx - ax) - (bx - ax) * (cz - az),
      );
    }
    expect(minimumUpwardArea).toBeGreaterThan(0);
  });

  it('uses a diagonal principal axis for a staircase road', () => {
    const source = catalog.maps.get('ridge_pass');
    expect(source).toBeDefined();
    if (source === undefined) return;
    const data = fixture(source, 'diagonal_road', [
      '=.....',
      '.=....',
      '..=...',
      '...=..',
      '....=.',
      '.....=',
    ]);
    const wear = buildRoadWear(data, () => 0, null);
    const dx = Math.abs((wear.positions[3] ?? 0) - (wear.positions[0] ?? 0));
    const dz = Math.abs((wear.positions[5] ?? 0) - (wear.positions[2] ?? 0));

    expect(dx).toBeGreaterThan(data.tileSize * 0.15);
    expect(dz).toBeGreaterThan(data.tileSize * 0.15);
  });

  it('keeps the largest shipped road network within a strict per-tile budget', () => {
    const maps = [...catalog.maps.values()];
    const data = maps.reduce((largest, candidate) => (
      roadTiles(candidate) > roadTiles(largest) ? candidate : largest
    ));
    const wear = buildRoadWear(data, heightAt, null);

    expect(data.id).toBe('cutbank_exchange');
    expect(wear.stats.roadTiles).toBe(roadTiles(data));
    expect(wear.stats.triangles).toBeLessThanOrEqual(wear.stats.roadTiles * 6);
    expect(wear.positions.length / 3).toBeLessThanOrEqual(wear.stats.roadTiles * 14);
  });
});
