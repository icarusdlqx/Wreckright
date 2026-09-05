import { Color, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, type Vector3Tuple } from 'three';
import type { TerrainMapData } from '../schema/map';
import type { TerrainGrid } from '../sim/terrain';
import { surroundColour, type AtmosphereRig } from './atmosphere';
import { LandscapeGeometry } from './landscapeGeometry';
import { addLandmarks, landscapeIdentity } from './landscapeLandmarks';

export interface BattlefieldLandscape {
  group: Group;
  setLowFx(low: boolean): void;
}

/** The playable surface is untouched; the edge skirts and public skyline supply the missing scale. */
export function buildBattlefieldLandscape(
  grid: TerrainGrid,
  map: TerrainMapData,
  heightAt: (x: number, z: number) => number,
  rig: AtmosphereRig,
): BattlefieldLandscape {
  const group = new Group();
  group.name = 'battlefield-landscape';
  const width = grid.width * grid.tileSize;
  const depth = grid.height * grid.tileSize;
  const span = Math.min(width, depth);
  const identity = landscapeIdentity(map.id);
  group.userData.landscapeIdentity = identity;
  const flooded = identity === 'floodworks' || identity === 'causeway';
  const originalFloorColour = surroundColour(rig);
  const landscapeFloorColour = new Color(flooded ? 0x597f82 : identity === 'foundry' ? 0x716e5e : 0x87957b)
    .lerp(originalFloorColour, .24);
  const floor = new Mesh(new PlaneGeometry(width * 9, depth * 9),
    new MeshBasicMaterial({ color: landscapeFloorColour }));
  floor.name = 'landscape-floor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(width / 2, -145, depth / 2);
  group.add(floor);

  const shelf = new LandscapeGeometry(rig.tint);
  const rock = identity === 'shale' ? 0x9d8477 : identity === 'quarry' ? 0x8b8b79 : 0xb39571;
  const shelfTop = flooded ? 0x829e83 : 0x819a73;
  const sides: readonly [Vector3Tuple, Vector3Tuple][] = [
    [[0, 0, 0], [width, 0, 0]],
    [[width, 0, 0], [width, 0, depth]],
    [[width, 0, depth], [0, 0, depth]],
    [[0, 0, depth], [0, 0, 0]],
  ];
  for (const [start, end] of sides) {
    const length = Math.hypot(end[0] - start[0], end[2] - start[2]);
    const count = Math.min(64, Math.ceil(length / grid.tileSize));
    const point = (station: number, band: number): Vector3Tuple => {
      const t = station / count;
      const x = start[0] + (end[0] - start[0]) * t;
      const z = start[2] + (end[2] - start[2]) * t;
      const ground = heightAt(x, z);
      const reach = band === 0 ? 0 : band === 1 ? 12 : band === 2 ? 50 : 115;
      const out = reach * span / 960;
      const height = band === 0 ? ground : band === 1 ? ground - 3 : band === 2
        ? ground * .5 - 27 + Math.sin(x / width * 9 + z / depth * 5) * 7 : -144;
      // Expanding the complete rectangle shares exact corner vertices between neighbouring strips.
      return [x + (x / width * 2 - 1) * out, height, z + (z / depth * 2 - 1) * out];
    };
    for (let station = 0; station < count; station += 1) {
      for (let band = 0; band < 3; band += 1) {
        shelf.quad(point(station, band), point(station + 1, band),
          point(station + 1, band + 1), point(station, band + 1),
          band === 0 ? shelfTop : band === 1 ? rock : 0x736f62);
      }
    }
  }
  // Side groups frame the entrance without planting decorative obstacles on walkable ground.
  for (const side of [-1, 1]) {
    for (let index = 0; index < 5; index += 1) {
      const x = side < 0 ? -span * (.17 + index * .024) : width + span * (.17 + index * .024);
      shelf.mesa([x, -144, depth * (.13 + index * .17 + Math.sin(index * 2) * .025)],
        [span * (.19 + index % 2 * .05), span * (.17 + index * .014), span * (.24 + index % 3 * .025)],
        rock, side * span * .025);
    }
  }
  addLandmarks(shelf, identity, width, depth);
  const material = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  const foreground = new Mesh(shelf.finish(), material);
  foreground.name = 'landscape-ledges-and-landmark';
  foreground.receiveShadow = false;
  foreground.castShadow = false;
  group.add(foreground);

  const horizon = new LandscapeGeometry(rig.tint);
  for (let index = 0; index < 9; index += 1) {
    const tall = identity === 'ridge' || identity === 'shale' || identity === 'quarry';
    horizon.mesa([width * (-.2 + index * .17), -144, depth + span * (.38 + index % 3 * .08)],
      [span * .4, span * ((tall ? .28 : .19) + Math.sin(index * 2.1) * .055), span * .34],
      index % 2 === 0 ? 0x809793 : 0x96a89c, identity === 'shale' ? span * .08 : 0);
  }
  const backdrop = new Mesh(horizon.finish(), material);
  backdrop.name = 'landscape-distant-ridges';
  group.add(backdrop);
  return {
    group,
    setLowFx(low): void {
      foreground.visible = !low;
      backdrop.visible = !low;
      // Low FX retains the original single flat surround draw and depth.
      floor.position.y = low ? -3 : -145;
      floor.material.color.copy(low ? originalFloorColour : landscapeFloorColour);
    },
  };
}
