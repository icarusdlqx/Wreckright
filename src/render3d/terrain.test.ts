import { Raycaster, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { createTerrainGrid } from '../sim/terrain';
import { buildTerrain } from './terrain';

describe('render terrain height', () => {
  it('samples the same diagonal facets that the indexed mesh draws', () => {
    const data = catalog.maps.get('ridge_pass');
    expect(data).toBeDefined();
    if (data === undefined) return;
    const grid = createTerrainGrid(data, catalog.rules.terrain);
    const terrain = buildTerrain(grid, data);
    const positions = terrain.mesh.geometry.getAttribute('position');
    const across = grid.width + 1;
    const height = (column: number, row: number): number => positions.getY(row * across + column);
    let column = 0;
    let row = 0;
    let nonCoplanar = false;
    for (let candidateRow = 0; candidateRow < grid.height; candidateRow += 1) {
      for (let candidateColumn = 0; candidateColumn < grid.width; candidateColumn += 1) {
        const diagonal = Math.abs(
          height(candidateColumn, candidateRow)
          + height(candidateColumn + 1, candidateRow + 1)
          - height(candidateColumn + 1, candidateRow)
          - height(candidateColumn, candidateRow + 1),
        );
        if (diagonal > 0.2) {
          column = candidateColumn;
          row = candidateRow;
          nonCoplanar = true;
        }
      }
    }
    expect(nonCoplanar).toBe(true);

    const a = height(column, row);
    const b = height(column + 1, row);
    const c = height(column, row + 1);
    const d = height(column + 1, row + 1);
    const size = grid.tileSize;
    const sample = (fx: number, fy: number): number =>
      terrain.heightAt((column + fx) * size, (row + fy) * size);
    expect(sample(0.2, 0.3)).toBeCloseTo(a + (b - a) * 0.2 + (c - a) * 0.3, 6);
    expect(sample(0.7, 0.6)).toBeCloseTo(d + (c - d) * 0.3 + (b - d) * 0.4, 6);

    terrain.mesh.geometry.dispose();
    terrain.waterSurface?.geometry.dispose();
    if (terrain.waterSurface !== null) {
      if (Array.isArray(terrain.waterSurface.material)) {
        terrain.waterSurface.material.forEach((material) => material.dispose());
      } else {
        terrain.waterSurface.material.dispose();
      }
    }
    if (Array.isArray(terrain.mesh.material)) {
      terrain.mesh.material.forEach((material) => material.dispose());
    } else {
      terrain.mesh.material.dispose();
    }
  });

  it('gates appended road wear out of the original low-FX draw range', () => {
    const data = catalog.maps.get('causeway');
    expect(data).toBeDefined();
    if (data === undefined) return;
    const grid = createTerrainGrid(data, catalog.rules.terrain);
    const terrain = buildTerrain(grid, data);
    const geometry = terrain.mesh.geometry;
    const baseIndexCount = grid.width * grid.height * 6;
    const fullIndexCount = geometry.index?.count ?? 0;

    expect(geometry.userData.terrainBaseIndexCount).toBe(baseIndexCount);
    expect(geometry.userData.terrainFullIndexCount).toBe(fullIndexCount);
    expect(fullIndexCount).toBeGreaterThan(baseIndexCount);
    expect(terrain.mesh.userData.roadWear).toMatchObject({
      roadTiles: 80,
      centreMarks: 80,
    });
    expect(terrain.mesh.children).toEqual([terrain.waterSurface]);
    expect(geometry.drawRange).toEqual({ start: 0, count: fullIndexCount });

    terrain.setLowFx(true);
    expect(geometry.drawRange).toEqual({ start: 0, count: baseIndexCount });
    expect(terrain.waterSurface?.visible).toBe(true);
    expect(terrain.waterSurface?.material.opacity).toBe(0.2);
    terrain.setLowFx(false);
    expect(geometry.drawRange).toEqual({ start: 0, count: fullIndexCount });

    const raycaster = new Raycaster(
      new Vector3(492, 1_000, 492),
      new Vector3(0, -1, 0),
    );
    const fullFxHits = raycaster.intersectObject(terrain.mesh, false);
    expect(fullFxHits.length).toBeGreaterThan(0);
    expect(fullFxHits.every((hit) => (hit.faceIndex ?? Infinity) < baseIndexCount / 3)).toBe(true);
    expect(fullFxHits[0]?.point.y).toBeCloseTo(terrain.heightAt(492, 492), 6);
    expect(geometry.drawRange).toEqual({ start: 0, count: fullIndexCount });
    terrain.setLowFx(true);
    const lowFxHits = raycaster.intersectObject(terrain.mesh, false);
    expect(lowFxHits[0]?.point.y).toBeCloseTo(fullFxHits[0]?.point.y ?? Infinity, 6);
    expect(geometry.drawRange).toEqual({ start: 0, count: baseIndexCount });

    geometry.dispose();
    terrain.waterSurface?.geometry.dispose();
    terrain.waterSurface?.material.dispose();
    if (Array.isArray(terrain.mesh.material)) {
      terrain.mesh.material.forEach((material) => material.dispose());
    } else {
      terrain.mesh.material.dispose();
    }
  });
});
