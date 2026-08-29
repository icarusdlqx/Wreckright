import type { TerrainMapData } from '../schema/map';
import type { MovementRules, TerrainRules, TerrainType } from '../schema/rules';
import type { Vec2 } from './types';

export interface TileRef {
  column: number;
  row: number;
}

export interface TerrainGrid {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  readonly minStepCost: number;
  /** Changes only when an authoritative terrain replacement succeeds. */
  readonly revision: number;
  idAt(column: number, row: number): string;
  idAtPoint(point: Vec2): string;
  typeAt(column: number, row: number): TerrainType;
  typeAtPoint(point: Vec2): TerrainType;
  replaceTypeAt(column: number, row: number, terrainId: string): boolean;
  elevationAt(column: number, row: number): number;
  elevationAtPoint(point: Vec2): number;
  /** Terrain, plateau and uphill pace as one multiplier shared with routing. */
  moveMultiplierAt(column: number, row: number, rise?: number): number;
  moveMultiplierAtPoint(point: Vec2, rise?: number): number;
  passable(column: number, row: number): boolean;
  inBounds(column: number, row: number): boolean;
  toTile(point: Vec2): TileRef;
  tileCentre(column: number, row: number): Vec2;
}

const OFF_MAP: TerrainType = {
  moveMultiplier: 0,
  coverFactor: 1,
  losObstruction: 1,
  heatDissipationMultiplier: 1,
  signatureFactor: 1,
  visionFactor: 1,
  passable: false,
};
const OFF_MAP_ID = 'off_map';

export function createTerrainGrid(
  data: TerrainMapData,
  rules: TerrainRules,
  movement?: MovementRules,
): TerrainGrid {
  const ids: string[] = new Array<string>(data.width * data.height);
  const cells: TerrainType[] = new Array<TerrainType>(data.width * data.height);
  const elevations = new Uint8Array(data.width * data.height);
  let revision = 0;

  for (let row = 0; row < data.height; row += 1) {
    const tileRow = data.tiles[row] ?? '';
    const elevationRow = data.elevation?.[row];
    for (let column = 0; column < data.width; column += 1) {
      const symbol = tileRow[column] ?? '';
      const terrainId = data.legend[symbol];
      const terrain = terrainId === undefined ? undefined : rules.types[terrainId];
      ids[row * data.width + column] = terrain === undefined ? OFF_MAP_ID : (terrainId ?? OFF_MAP_ID);
      cells[row * data.width + column] = terrain ?? OFF_MAP;
      elevations[row * data.width + column] = Number(elevationRow?.[column] ?? '0');
    }
  }

  const inBounds = (column: number, row: number): boolean =>
    column >= 0 && row >= 0 && column < data.width && row < data.height;

  const typeAt = (column: number, row: number): TerrainType =>
    inBounds(column, row) ? (cells[row * data.width + column] ?? OFF_MAP) : OFF_MAP;

  const idAt = (column: number, row: number): string =>
    inBounds(column, row) ? (ids[row * data.width + column] ?? OFF_MAP_ID) : OFF_MAP_ID;

  const replaceTypeAt = (column: number, row: number, terrainId: string): boolean => {
    if (!inBounds(column, row)) return false;
    const terrain = rules.types[terrainId];
    if (terrain === undefined) return false;
    const cell = row * data.width + column;
    if (ids[cell] === terrainId) return false;
    ids[cell] = terrainId;
    cells[cell] = terrain;
    revision += 1;
    return true;
  };

  const elevationAt = (column: number, row: number): number =>
    inBounds(column, row) ? (elevations[row * data.width + column] ?? 0) : 0;

  const moveMultiplierAt = (column: number, row: number, rise = 0): number => {
    const terrain = typeAt(column, row);
    if (movement === undefined) return terrain.moveMultiplier;
    const levels = Math.min(elevationAt(column, row), movement.elevationSpeedMaxLevels);
    const plateau = movement.elevationSpeedPerLevel ** levels;
    const climb = 1 / (1 + Math.max(0, rise) * (1 - movement.climbSpeedFactor));
    return terrain.moveMultiplier * plateau * climb;
  };

  let minStepCost = Number.POSITIVE_INFINITY;
  for (let row = 0; row < data.height; row += 1) {
    for (let column = 0; column < data.width; column += 1) {
      const pace = moveMultiplierAt(column, row);
      if (pace > 0) minStepCost = Math.min(minStepCost, 1 / pace);
    }
  }
  if (!Number.isFinite(minStepCost)) minStepCost = 1;

  return {
    id: data.id,
    width: data.width,
    height: data.height,
    tileSize: data.tileSize,
    minStepCost,
    get revision() {
      return revision;
    },
    idAt,
    idAtPoint: (point) =>
      idAt(Math.floor(point.x / data.tileSize), Math.floor(point.y / data.tileSize)),
    typeAt,
    typeAtPoint: (point) =>
      typeAt(Math.floor(point.x / data.tileSize), Math.floor(point.y / data.tileSize)),
    replaceTypeAt,
    elevationAt,
    elevationAtPoint: (point) =>
      elevationAt(Math.floor(point.x / data.tileSize), Math.floor(point.y / data.tileSize)),
    moveMultiplierAt,
    moveMultiplierAtPoint: (point, rise) =>
      moveMultiplierAt(
        Math.floor(point.x / data.tileSize),
        Math.floor(point.y / data.tileSize),
        rise,
      ),
    passable: (column, row) => {
      const terrain = typeAt(column, row);
      return terrain.passable && terrain.moveMultiplier > 0;
    },
    inBounds,
    toTile: (point) => ({
      column: Math.floor(point.x / data.tileSize),
      row: Math.floor(point.y / data.tileSize),
    }),
    tileCentre: (column, row) => ({
      x: (column + 0.5) * data.tileSize,
      y: (row + 0.5) * data.tileSize,
    }),
  };
}
