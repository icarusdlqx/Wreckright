import { Color, Matrix4, Quaternion, Vector3 } from 'three';
import type { TerrainMapData } from '../schema/map';
import type { TerrainGrid } from '../sim/terrain';
import { shade } from '../render/palette';
import type { PropKind } from './propGeometry';

/** Deterministic per-tile jitter; the same map always grows the same woods. */
function hash(column: number, row: number, salt: number): number {
  const value = Math.sin(column * 127.1 + row * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function terrainIdAt(data: TerrainMapData, column: number, row: number): string {
  return data.legend[data.tiles[row]?.[column] ?? ''] ?? 'open';
}

function waterEdge(
  data: TerrainMapData,
  column: number,
  row: number,
): readonly [number, number] | null {
  for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    if (terrainIdAt(data, column + dc, row + dr) === 'water') return [dc, dr];
  }
  return null;
}

export interface PropPlacement {
  /** Tile index in the vision grid, for hiding props on unexplored ground. */
  tile: number;
  matrix: Matrix4;
  colour: Color;
  burntMatrix: Matrix4 | null;
  burntColour: Color | null;
}

const HIDDEN = new Matrix4().makeScale(0, 0, 0);

export function buildPropPlacements(grid: TerrainGrid, data: TerrainMapData,
  heightAt: (x: number, y: number) => number,
  tint: { colour: Color; strength: number } | null): Record<PropKind, PropPlacement[]> {
  const size = grid.tileSize;
  const theme = data.propTheme ?? 'alpine';
  const family = data.sceneryFamily;
  const pending: Record<PropKind, PropPlacement[]> = {
    tree: [],
    snag: [],
    boulder: [],
    shale: [],
    crag: [],
    block: [],
    yard: [],
    causeway: [],
    wreckage: [],
    relay: [], silos: [], gantry: [], spire: [],
  };

  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const up = new Vector3(0, 1, 0);
  const lean = new Vector3(1, 0, 0);

  const place = (
    kind: PropKind,
    tile: number,
    x: number,
    y: number,
    sx: number,
    sy: number,
    sz: number,
    colour: number,
    spin: number,
    tilt = 0,
    charredNoise: number | null = null,
  ): void => {
    position.set(x, heightAt(x, y) - 0.4, y);
    rotation.setFromAxisAngle(up, spin * Math.PI * 2);
    if (tilt !== 0) rotation.multiply(new Quaternion().setFromAxisAngle(lean, tilt));
    scale.set(sx, sy, sz);
    const matrix = new Matrix4().compose(position, rotation, scale);
    let burntMatrix: Matrix4 | null = null;
    let burntColour: Color | null = null;
    if (charredNoise !== null) {
      if (charredNoise < 0.4) burntMatrix = HIDDEN;
      else {
        scale.set(sx * 0.38, sy * (0.42 + charredNoise * 0.22), sz * 0.38);
        burntMatrix = new Matrix4().compose(position, rotation, scale);
      }
      burntColour = new Color(0x292721);
    }
    pending[kind].push({
      tile,
      matrix,
      colour:
        tint === null
          ? new Color(colour)
          : new Color(colour).lerp(tint.colour, tint.strength),
      burntMatrix,
      burntColour,
    });
  };

  const landmarks = new Map((data.landmarks ?? []).map((site) => [site.row * grid.width + site.column, site]));
  for (let row = 0; row < grid.height; row += 1) {
    for (let column = 0; column < grid.width; column += 1) {
      const id = terrainIdAt(data, column, row);
      const tile = row * grid.width + column;
      const h = (salt: number): number => hash(column, row, salt);

      const landmark = landmarks.get(tile);
      if (landmark !== undefined) {
        place(landmark.kind, tile, (column + 0.5) * size, (row + 0.5) * size,
          size, landmark.kind === 'spire' ? 17 : 22, size, 0xffffff, 0);
        continue;
      }
      if (id === 'forest') {
        const trees = 2 + (h(11) < 0.45 ? 1 : 0);
        for (let i = 0; i < trees; i += 1) {
          const x = (column + 0.15 + 0.7 * h(13 + i * 7)) * size;
          const y = (row + 0.15 + 0.7 * h(17 + i * 7)) * size;
          const height = 10.5 + h(19 + i * 7) * 7.5;
          const radius = height * 0.34;
          const snagChance = theme === 'shale' ? 0.32 : theme === 'alpine' ? 0.16 : 0;
          const dead = h(107 + i * 7) < snagChance;
          const tone = shade(0xffffff, 0.82 + h(23 + i * 7) * 0.18);
          place(
            dead ? 'snag' : 'tree', tile, x, y,
            dead ? radius * 0.46 : radius,
            dead ? height * 0.78 : height,
            dead ? radius * 0.46 : radius,
            tone, h(29 + i),
            theme === 'causeway' ? (h(109 + i * 7) - 0.5) * 0.12 : 0,
            h(211 + i * 7),
          );
        }
      } else if (id === 'rough') {
        if (family !== undefined && h(5) < 0.16) {
          const width = 4.5 + h(31) * 2.5;
          place(
            'yard', tile,
            (column + 0.2 + 0.6 * h(37)) * size,
            (row + 0.2 + 0.6 * h(41)) * size,
            width, 3.2 + h(43) * 1.8, width * (0.72 + h(47) * 0.25),
            shade(0xffffff, 0.86 + h(53) * 0.12), h(59),
            family === 'linewrought_workshop' ? (h(61) - 0.5) * 0.1 : 0,
          );
        } else if (theme === 'industrial' && h(5) < (family === undefined ? 0.2 : 0.34)) {
          const width = 5 + h(31) * 3.5;
          place(
            'wreckage', tile,
            (column + 0.18 + 0.64 * h(37)) * size,
            (row + 0.18 + 0.64 * h(41)) * size,
            width, 4 + h(43) * 3, width * (0.75 + h(47) * 0.3),
            shade(0xffffff, 0.78 + h(53) * 0.2), h(59),
          );
        } else if (theme === 'shale' && h(5) < 0.42) {
          const girth = 2.2 + h(31) * 2.5;
          place(
            'shale', tile,
            (column + 0.18 + 0.64 * h(37)) * size,
            (row + 0.18 + 0.64 * h(41)) * size,
            girth, 4.5 + h(43) * 5.5, girth * (0.7 + h(47) * 0.35),
            shade(0xffffff, 0.8 + h(53) * 0.18), h(59),
            (h(61) - 0.5) * 0.18,
          );
        } else if (theme !== 'industrial' && theme !== 'shale' && h(5) < 0.3) {
          const girth = 1.8 + h(31) * 2.3;
          place(
            'boulder', tile,
            (column + 0.2 + 0.6 * h(37)) * size,
            (row + 0.2 + 0.6 * h(41)) * size,
            girth, 1.5 + h(43) * 2, girth * (0.8 + h(47) * 0.4),
            shade(0xffffff, 0.8 + h(53) * 0.18), h(59),
          );
        }
      } else if (id === 'impassable') {
        for (let i = 0; i < 2; i += 1) {
          const girth = 2.2 + h(61 + i * 5) * 2.4;
          place(
            'crag', tile,
            (column + 0.2 + 0.6 * h(67 + i * 5)) * size,
            (row + 0.2 + 0.6 * h(71 + i * 5)) * size,
            girth, 7 + h(73 + i * 5) * 9, girth,
            shade(0xffffff, 0.8 + h(79 + i * 5) * 0.18),
            h(83 + i), (h(89 + i) - 0.5) * 0.24,
          );
        }
      } else if (id === 'building') {
        place(
          'block', tile,
          (column + 0.5) * size,
          (row + 0.5) * size,
          size * (0.62 + h(91) * 0.24), 8 + h(97) * 8, size * (0.62 + h(101) * 0.24),
          shade(0xffffff, 0.8 + h(103) * 0.18),
          theme === 'industrial' && h(107) < 0.5 ? 0.25 : 0,
        );
      } else if (id === 'road' && theme === 'causeway') {
        const edge = waterEdge(data, column, row);
        if (edge === null) continue;
        const [dc, dr] = edge;
        const tangentJitter = (h(113) - 0.5) * 0.08;
        place(
          'causeway', tile,
          (column + 0.5 + dc * 0.42 - dr * tangentJitter) * size,
          (row + 0.5 + dr * 0.42 + dc * tangentJitter) * size,
          size * 0.88, 3.6 + h(127) * 0.8, size * 0.34,
          shade(0xffffff, 0.84 + h(131) * 0.14), dc === 0 ? 0 : 0.25,
        );
      }
    }
  }
  return pending;
}
