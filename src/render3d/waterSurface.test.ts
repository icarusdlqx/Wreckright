import { BufferAttribute, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { createTerrainGrid } from '../sim/terrain';
import { buildTerrain } from './terrain';
import { waterSubmergenceOffset } from './waterSurface';

describe('procedural water surface', () => {
  it('adds one deterministic, bounded ripple draw only to wet maps', () => {
    const wetData = catalog.maps.get('causeway');
    const dryData = catalog.maps.get('foundry_district');
    expect(wetData).toBeDefined();
    expect(dryData).toBeDefined();
    if (wetData === undefined || dryData === undefined) return;

    const wet = buildTerrain(
      createTerrainGrid(wetData, catalog.rules.terrain),
      wetData,
    );
    const sameWet = buildTerrain(
      createTerrainGrid(wetData, catalog.rules.terrain),
      wetData,
    );
    const dry = buildTerrain(
      createTerrainGrid(dryData, catalog.rules.terrain),
      dryData,
    );

    expect(wet.waterSurface?.name).toBe('water-surface');
    expect(wet.mesh.children).toEqual([wet.waterSurface]);
    expect(dry.waterSurface).toBeNull();
    expect(dry.mesh.children).toHaveLength(0);

    const positions = wet.waterSurface?.geometry.getAttribute('position');
    const matching = sameWet.waterSurface?.geometry.getAttribute('position');
    expect(Array.from(positions?.array ?? [])).toEqual(Array.from(matching?.array ?? []));

    const marksByTile = new Map<string, number>();
    for (let mark = 0; mark < (positions?.count ?? 0) / 4; mark += 1) {
      let centreX = 0;
      let centreY = 0;
      for (let corner = 0; corner < 4; corner += 1) {
        const vertex = mark * 4 + corner;
        centreX += positions?.getX(vertex) ?? 0;
        centreY += positions?.getZ(vertex) ?? 0;
      }
      const tile = `${Math.floor(centreX / wetData.tileSize)}:${Math.floor(centreY / wetData.tileSize)}`;
      marksByTile.set(tile, (marksByTile.get(tile) ?? 0) + 1);
    }
    const waterTiles = wetData.tiles.reduce(
      (count, row) => count + [...row].filter((symbol) => wetData.legend[symbol] === 'water').length,
      0,
    );
    expect(marksByTile.size).toBeGreaterThan(0);
    expect(marksByTile.size).toBeLessThan(waterTiles * 0.4);
    expect(Math.max(...marksByTile.values())).toBeLessThanOrEqual(2);
    expect((positions?.count ?? 0) / 4).toBeLessThanOrEqual(1_400);

    const material = wet.waterSurface?.material;
    expect(material).toBeInstanceOf(MeshBasicMaterial);
    if (material instanceof MeshBasicMaterial) {
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(false);
      expect(material.opacity).toBeLessThanOrEqual(0.22);
    }

    const surface = wet.waterSurface;
    expect(surface).not.toBeNull();
    if (surface === null) return;
    const geometry = surface.geometry;
    const position = geometry.getAttribute('position');
    expect(position).toBeInstanceOf(BufferAttribute);
    if (!(position instanceof BufferAttribute)) return;
    const positionArray = position.array;
    const positionVersion = position.version;
    const materialId = surface.material.uuid;
    const geometryId = geometry.uuid;

    surface.setTime(1.25);
    const first = surface.material.opacity;
    surface.setTime(4.75);
    const second = surface.material.opacity;
    surface.setTime(1.25);
    expect(surface.material.opacity).toBe(first);
    expect(second).not.toBe(first);
    expect(first).toBeGreaterThanOrEqual(0.1);
    expect(first).toBeLessThanOrEqual(0.22);
    expect(second).toBeGreaterThanOrEqual(0.1);
    expect(second).toBeLessThanOrEqual(0.22);

    surface.setLowFx(true);
    expect(surface.visible).toBe(true);
    expect(surface.material.opacity).toBe(0.2);
    for (let step = 0; step < 1_000; step += 1) surface.setTime(step / 20);
    expect(surface.material.opacity).toBe(0.2);
    surface.setLowFx(false);
    surface.setTime(4.75);
    expect(surface.material.opacity).toBe(second);

    expect(surface.geometry.uuid).toBe(geometryId);
    expect(surface.material.uuid).toBe(materialId);
    expect(surface.geometry.getAttribute('position')).toBe(position);
    expect(position.array).toBe(positionArray);
    expect(position.version).toBe(positionVersion);
    expect(wet.mesh.children).toHaveLength(1);
  });

  it('lowers only waterborne mechs by roughly half their rendered height', () => {
    const model = { height: 30 };
    expect(waterSubmergenceOffset(model, 'water')).toBeCloseTo(-13.8, 6);
    expect(waterSubmergenceOffset(model, 'forest')).toBe(0);
    expect(waterSubmergenceOffset({ height: -5 }, 'water')).toBe(-0);
  });
});
