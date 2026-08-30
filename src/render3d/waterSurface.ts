import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import type { TerrainMapData } from '../schema/map';
import type { TerrainGrid } from '../sim/terrain';
import type { MechModel } from './mechModel';

const MAX_GLINT_TILES = 700;
const GLINT_TILE_DENSITY = 0.28;
const SURFACE_LIFT = 0.22;
const SUBMERGED_FRACTION = 0.46;
const STATIC_OPACITY = 0.2;

interface WaterTile {
  column: number;
  row: number;
}

/**
 * The existing one-draw water glints, with a zero-allocation presentation
 * clock. Low FX deliberately restores the old static opacity and then stops
 * touching the material, preserving the previous draw and triangle budget.
 */
export class WaterSurface extends Mesh<BufferGeometry, MeshBasicMaterial> {
  private lowFx = false;

  setLowFx(lowFx: boolean): void {
    this.lowFx = lowFx;
    if (lowFx) this.material.opacity = STATIC_OPACITY;
  }

  setTime(seconds: number): void {
    if (this.lowFx || !Number.isFinite(seconds)) return;
    const time = Math.max(0, seconds);
    this.material.opacity =
      0.17 + Math.sin(time * 1.7) * 0.03 + Math.sin(time * 3.1 + 0.8) * 0.02;
  }
}

/** Deterministic tile noise; water keeps the same highlights every load. */
function hash(column: number, row: number, salt: number): number {
  const value = Math.sin(column * 127.1 + row * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function terrainIdAt(data: TerrainMapData, column: number, row: number): string {
  return data.legend[data.tiles[row]?.[column] ?? ''] ?? 'open';
}

function cappedGlintTiles(grid: TerrainGrid, data: TerrainMapData): WaterTile[] {
  const water: WaterTile[] = [];
  for (let row = 0; row < grid.height; row += 1) {
    for (let column = 0; column < grid.width; column += 1) {
      if (terrainIdAt(data, column, row) === 'water') water.push({ column, row });
    }
  }
  const selected = water.filter(
    (tile) => hash(tile.column, tile.row, 139) < GLINT_TILE_DENSITY,
  );
  // Even a one-tile ford gets one quiet highlight; larger ponds stay sparse.
  if (selected.length === 0 && water[0] !== undefined) selected.push(water[0]);
  if (selected.length <= MAX_GLINT_TILES) return selected;
  const stride = selected.length / MAX_GLINT_TILES;
  return Array.from(
    { length: MAX_GLINT_TILES },
    (_, index) => selected[Math.floor(index * stride)],
  ).filter((tile): tile is WaterTile => tile !== undefined);
}

/**
 * A few thin, terrain-following glints make ponds read as a surface rather
 * than blue soil. They share one geometry and one draw call, remain below the
 * shroud, and stop growing once the water-tile budget is spent.
 */
export function buildWaterSurface(
  grid: TerrainGrid,
  data: TerrainMapData,
  heightAt: (x: number, y: number) => number,
): WaterSurface | null {
  const tiles = cappedGlintTiles(grid, data);
  if (tiles.length === 0) return null;

  const positions: number[] = [];
  const colours: number[] = [];
  const indices: number[] = [];
  const colour = new Color();
  const size = grid.tileSize;

  for (const tile of tiles) {
    const baseAngle = hash(tile.column, tile.row, 151) * Math.PI;
    const directionX = Math.cos(baseAngle);
    const directionY = Math.sin(baseAngle);
    const normalX = -directionY;
    const normalY = directionX;
    const rippleCount = hash(tile.column, tile.row, 157) < 0.22 ? 2 : 1;

    for (let ripple = 0; ripple < rippleCount; ripple += 1) {
      const salt = 163 + ripple * 13;
      const along = (hash(tile.column, tile.row, salt) - 0.5) * size * 0.38;
      const across = (hash(tile.column, tile.row, salt + 1) - 0.5) * size * 0.38;
      const centreX = (tile.column + 0.5) * size + directionX * along + normalX * across;
      const centreY = (tile.row + 0.5) * size + directionY * along + normalY * across;
      const halfLength = size * (0.055 + hash(tile.column, tile.row, salt + 2) * 0.075);
      const halfWidth = size * (0.004 + hash(tile.column, tile.row, salt + 3) * 0.004);
      const start = positions.length / 3;
      const corners = [
        [-halfLength, -halfWidth],
        [halfLength, -halfWidth],
        [halfLength, halfWidth],
        [-halfLength, halfWidth],
      ] as const;
      const brightness = 0.68 + hash(tile.column, tile.row, salt + 4) * 0.24;
      colour.setRGB(0.42 * brightness, 0.69 * brightness, 0.78 * brightness);

      for (const [forward, sideways] of corners) {
        const x = centreX + directionX * forward + normalX * sideways;
        const y = centreY + directionY * forward + normalY * sideways;
        positions.push(x, heightAt(x, y) + SURFACE_LIFT, y);
        colours.push(colour.r, colour.g, colour.b);
      }
      indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  const surface = new WaterSurface(
    geometry,
    new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: STATIC_OPACITY,
      depthWrite: false,
    }),
  );
  surface.name = 'water-surface';
  surface.renderOrder = 1;
  return surface;
}

/** Negative vertical offset used when placing a mech on the water surface. */
export function waterSubmergenceOffset(
  model: Pick<MechModel, 'height'>,
  terrainId: string,
): number {
  if (terrainId !== 'water') return 0;
  return -Math.max(0, model.height) * SUBMERGED_FRACTION;
}
