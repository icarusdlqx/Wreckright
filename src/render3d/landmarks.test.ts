import { Box3, InstancedMesh, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import type { TeamVision } from '../sim/sensors';
import { createTerrainGrid } from '../sim/terrain';
import { PropLayer } from './props';
import { buildPropPlacements } from './propPlacements';
import { createLandmarkGeometry } from './landmarkGeometry';
import { createPropGeometry } from './propGeometry';

describe('battlefield landmark presentation', () => {
  it('keeps each whole silhouette inside its blocked tile and the existing skyline height', () => {
    for (const data of catalog.maps.values()) {
      const grid = createTerrainGrid(data, catalog.rules.terrain);
      const placements = buildPropPlacements(grid, data, () => 0, null);
      for (const site of data.landmarks ?? []) {
        const placement = placements[site.kind].find((entry) => entry.tile === site.row * grid.width + site.column);
        if (placement === undefined) throw new Error(`missing ${site.id}`);
        const geometry = createLandmarkGeometry(site.kind);
        geometry.computeBoundingBox();
        const bounds = geometry.boundingBox!.clone().applyMatrix4(placement.matrix);
        expect(bounds.min.x).toBeGreaterThanOrEqual(site.column * grid.tileSize);
        expect(bounds.max.x).toBeLessThanOrEqual((site.column + 1) * grid.tileSize);
        expect(bounds.min.z).toBeGreaterThanOrEqual(site.row * grid.tileSize);
        expect(bounds.max.z).toBeLessThanOrEqual((site.row + 1) * grid.tileSize);
        expect(bounds.max.y).toBeLessThan(30);
        expect(geometry.getAttribute('position').count / 3).toBeLessThan(250);
        expect(geometry.groups).toHaveLength(0);
        expect(placements.block.some((entry) => entry.tile === placement.tile)).toBe(false);
        expect(placements.crag.some((entry) => entry.tile === placement.tile)).toBe(false);
        geometry.dispose();
      }
    }
  });

  it('conceals landmark silhouettes until their own tile is explored, with incremental updates', () => {
    const data = catalog.maps.get('ridge_pass')!;
    const grid = createTerrainGrid(data, catalog.rules.terrain);
    const layer = new PropLayer(grid, data, () => 0);
    const cells = grid.width * grid.height;
    const vision: TeamVision = {
      team: 0, visible: new Set(), identified: new Set(), detected: new Set(), tracks: new Map(),
      observedHulks: new Set(), ghosts: new Map(), tiles: new Uint8Array(cells),
      explored: new Uint8Array(cells), opticalFootprints: new Map(),
    };
    const mesh = layer.group.children.find((child) => child.name === 'props-relay') as InstancedMesh;
    const matrix = new Matrix4();
    layer.update(vision);
    mesh.getMatrixAt(0, matrix);
    expect(matrix.determinant()).toBe(0);
    const site = data.landmarks!.find((entry) => entry.kind === 'relay')!;
    const tile = site.row * grid.width + site.column;
    vision.explored[tile - 1] = 1;
    layer.update(vision);
    mesh.getMatrixAt(0, matrix);
    expect(matrix.determinant()).toBe(0);
    mesh.instanceMatrix.clearUpdateRanges();
    vision.explored[tile] = 1;
    layer.update(vision);
    mesh.getMatrixAt(0, matrix);
    expect(matrix.determinant()).toBeGreaterThan(0);
    expect(mesh.instanceMatrix.updateRanges).toEqual([{ start: 0, count: 16 }]);
    layer.dispose();
    expect(layer.group.children).toHaveLength(0);
  });

  it('keeps ordinary industrial roofs below landmarks and causeway rails below a mech body', () => {
    for (const id of ['foundry_district', 'causeway']) {
      const data = catalog.maps.get(id)!;
      const grid = createTerrainGrid(data, catalog.rules.terrain);
      const kind = id === 'causeway' ? 'causeway' : 'block';
      const geometry = createPropGeometry(kind, data.propTheme ?? 'alpine');
      geometry.computeBoundingBox();
      const bounds = new Box3();
      const size = new Vector3();
      for (const placement of buildPropPlacements(grid, data, () => 0, null)[kind]) {
        bounds.copy(geometry.boundingBox!).applyMatrix4(placement.matrix).getSize(size);
        expect(size.y).toBeLessThan(kind === 'causeway' ? 5 : 20);
      }
      geometry.dispose();
    }
  });
});
