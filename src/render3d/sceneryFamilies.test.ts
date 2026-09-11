import { Box3, InstancedMesh } from 'three';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { TerrainMapSchema, type SceneryFamily, type TerrainMapData } from '../schema/map';
import { createTerrainGrid } from '../sim/terrain';
import { buildPropPlacements } from './propPlacements';
import { PropLayer } from './props';

const FAMILIES = ['linewrought_workshop', 'aurelian_civic'] as const;

function familyMap(family: SceneryFamily, id = 'foundry_district'): TerrainMapData {
  const base = catalog.maps.get(id);
  if (base === undefined) throw new Error(`missing ${id} fixture`);
  return { ...base, sceneryFamily: family };
}

describe('campaign scenery families', () => {
  it.each(FAMILIES)('accepts the authored %s family and rejects unknown dressing', (family) => {
    expect(TerrainMapSchema.safeParse(familyMap(family)).success).toBe(true);
    expect(TerrainMapSchema.safeParse({ ...familyMap(family), sceneryFamily: 'enemy_red' }).success)
      .toBe(false);
  });

  it('keeps collision, movement and elevation independent from constructed dressing', () => {
    const base = catalog.maps.get('foundry_district')!;
    const baseline = createTerrainGrid(base, catalog.rules.terrain, catalog.rules.movement);
    for (const family of FAMILIES) {
      const dressed = createTerrainGrid(familyMap(family), catalog.rules.terrain, catalog.rules.movement);
      for (let row = 0; row < base.height; row += 1) {
        for (let column = 0; column < base.width; column += 1) {
          expect(dressed.idAt(column, row)).toBe(baseline.idAt(column, row));
          expect(dressed.passable(column, row)).toBe(baseline.passable(column, row));
          expect(dressed.moveMultiplierAt(column, row)).toBe(baseline.moveMultiplierAt(column, row));
          expect(dressed.elevationAt(column, row)).toBe(baseline.elevationAt(column, row));
        }
      }
    }
  });

  it.each(FAMILIES)('%s stays low, bounded and inside the tile it dresses', (family) => {
    const map = familyMap(family);
    const grid = createTerrainGrid(map, catalog.rules.terrain);
    const placements = buildPropPlacements(grid, map, () => 0, null);
    const layer = new PropLayer(grid, map, () => 0);
    try {
      const yard = layer.group.children.find((child) => child.name === 'props-yard');
      expect(yard).toBeInstanceOf(InstancedMesh);
      expect(placements.yard.length).toBeGreaterThan(10);
      expect(placements.yard.length).toBeLessThanOrEqual(320);
      expect(layer.group.children).toHaveLength(5);
      const instances = layer.group.children.reduce(
        (total, child) => total + (child instanceof InstancedMesh ? child.count : 0), 0,
      );
      expect(instances).toBeLessThanOrEqual(450);

      const geometry = (yard as InstancedMesh).geometry;
      geometry.computeBoundingBox();
      const bounds = new Box3();
      for (const placement of placements.yard) {
        bounds.copy(geometry.boundingBox!).applyMatrix4(placement.matrix);
        const column = placement.tile % grid.width;
        const row = Math.floor(placement.tile / grid.width);
        expect(bounds.min.x).toBeGreaterThan(column * grid.tileSize);
        expect(bounds.max.x).toBeLessThan((column + 1) * grid.tileSize);
        expect(bounds.min.z).toBeGreaterThan(row * grid.tileSize);
        expect(bounds.max.z).toBeLessThan((row + 1) * grid.tileSize);
        expect(bounds.max.y).toBeLessThan(2.5);
      }
    } finally {
      layer.dispose();
      expect(layer.group.children).toHaveLength(0);
    }
  });

  it('gives the two families distinct building and yard silhouettes without extra batches', () => {
    const signatures = FAMILIES.map((family) => {
      const map = familyMap(family);
      const grid = createTerrainGrid(map, catalog.rules.terrain);
      const layer = new PropLayer(grid, map, () => 0);
      const signature = layer.group.children
        .filter((child) => child.name === 'props-block' || child.name === 'props-yard')
        .map((child) => {
          const mesh = child as InstancedMesh;
          return [mesh.name, mesh.geometry.getAttribute('position').count,
            Array.from(mesh.geometry.getAttribute('color').array).slice(0, 18)];
        });
      layer.dispose();
      return signature;
    });
    expect(signatures[0]).not.toEqual(signatures[1]);
  });

  it.each(FAMILIES)('%s stays inside the large-map resource budget and disposes cleanly', (family) => {
    const map = familyMap(family, 'cutbank_exchange');
    const grid = createTerrainGrid(map, catalog.rules.terrain);
    const layer = new PropLayer(grid, map, () => 0);
    expect(layer.group.children).toHaveLength(5);
    expect(layer.group.children.reduce(
      (total, child) => total + (child instanceof InstancedMesh ? child.count : 0), 0,
    )).toBeLessThanOrEqual(450);
    layer.dispose();
    expect(layer.group.children).toHaveLength(0);
  });
});
