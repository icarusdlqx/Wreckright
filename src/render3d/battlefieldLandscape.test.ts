import { Mesh, Object3D, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { catalog } from '../../tests/support';
import { createTerrainGrid } from '../sim/terrain';
import { buildAtmosphereRig } from './atmosphere';
import { buildBattlefieldLandscape } from './battlefieldLandscape';
import { disposeObjectResources } from './sceneResources';
import { buildTerrain } from './terrain';

function fixture(mapId: string) {
  const map = catalog.maps.get(mapId)!;
  const grid = createTerrainGrid(map, catalog.rules.terrain);
  const terrain = buildTerrain(grid, map);
  const atmosphere = catalog.atmospheres.get(map.atmosphereId)!;
  const target = new Object3D();
  const rig = buildAtmosphereRig(atmosphere, target, new Vector3(), 1_000);
  const landscape = buildBattlefieldLandscape(grid, map, terrain.heightAt, rig);
  const cleanup = (): void => {
    disposeObjectResources(landscape.group);
    disposeObjectResources(terrain.mesh);
    rig.sun.shadow.dispose();
  };
  return { grid, landscape, cleanup };
}

describe('authored battlefield surroundings', () => {
  it.each(['ridge_pass', 'foundry_district', 'blackglass_quarry', 'cutbank_exchange', 'shale_steps', 'causeway'])(
    '%s keeps every scenery triangle outside playable ground, with a bounded draw budget', (mapId) => {
      const { grid, landscape, cleanup } = fixture(mapId);
      const width = grid.width * grid.tileSize;
      const depth = grid.height * grid.tileSize;
      const revision = grid.revision;
      expect(landscape.group.children).toHaveLength(3);
      let triangles = 0;
      for (const node of landscape.group.children.slice(1)) {
        expect(node).toBeInstanceOf(Mesh);
        const mesh = node as Mesh;
        const positions = mesh.geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index += 3) {
          const vertices = [index, index + 1, index + 2].map((at) => new Vector3().fromBufferAttribute(positions, at));
          expect(vertices.every((v) => Number.isFinite(v.x + v.y + v.z))).toBe(true);
          expect(vertices.every((v) => v.x <= .001) || vertices.every((v) => v.x >= width - .001)
            || vertices.every((v) => v.z <= .001) || vertices.every((v) => v.z >= depth - .001)).toBe(true);
          triangles += 1;
        }
      }
      expect(triangles).toBeGreaterThan(900);
      expect(triangles).toBeLessThan(4_000);
      expect(grid.revision).toBe(revision);
      cleanup();
    },
  );

  it('retains the single Low FX surround draw and reuses its three geometry resources on toggles', () => {
    const { landscape, cleanup } = fixture('causeway');
    const nodes = [...landscape.group.children];
    const ids = nodes.map((node) => (node as Mesh).geometry.uuid);
    const disposed = vi.fn();
    for (const node of nodes) (node as Mesh).geometry.addEventListener('dispose', disposed);
    for (let index = 0; index < 20; index += 1) {
      landscape.setLowFx(true);
      expect(nodes.filter((node) => node.visible)).toHaveLength(1);
      expect(nodes[0]?.position.y).toBe(-3);
      landscape.setLowFx(false);
      expect(nodes.filter((node) => node.visible)).toHaveLength(3);
      expect(nodes[0]?.position.y).toBe(-145);
      expect(nodes.map((node) => (node as Mesh).geometry.uuid)).toEqual(ids);
    }
    cleanup();
    expect(disposed).toHaveBeenCalledTimes(3);
  });

  it('gives each of the six battlefields a distinct, repeatable silhouette', () => {
    const identities = new Set<string>();
    const shapes = new Set<string>();
    for (const mapId of ['ridge_pass', 'foundry_district', 'blackglass_quarry', 'cutbank_exchange', 'shale_steps', 'causeway']) {
      const first = fixture(mapId);
      const second = fixture(mapId);
      const shape = (root: Object3D): string => JSON.stringify(root.children.slice(1).map((node) =>
        Array.from((node as Mesh).geometry.getAttribute('position').array)));
      expect(shape(first.landscape.group)).toBe(shape(second.landscape.group));
      shapes.add(shape(first.landscape.group));
      identities.add(first.landscape.group.userData.landscapeIdentity as string);
      first.cleanup(); second.cleanup();
    }
    expect(identities.size).toBe(6);
    expect(shapes.size).toBe(6);
  });
});
