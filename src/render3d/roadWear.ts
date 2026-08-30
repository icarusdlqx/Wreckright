import { Color } from 'three';
import type { TerrainMapData } from '../schema/map';
import { shade, TERRAIN_COLOURS } from '../render/palette';

const ROAD_LIFT = 0.12;
const EDGE_LIFT = 0.14;
const CRACK_LIFT = 0.18;
const MAX_EDGE_PATCHES_PER_TILE = 2;

type Point = readonly [x: number, z: number];

interface RoadEdge {
  dc: number;
  dr: number;
  salt: number;
}

const CARDINAL_EDGES: readonly RoadEdge[] = [
  { dc: 0, dr: -1, salt: 31 },
  { dc: 1, dr: 0, salt: 47 },
  { dc: 0, dr: 1, salt: 61 },
  { dc: -1, dr: 0, salt: 79 },
];

export interface RoadWearGeometry {
  positions: number[];
  colours: number[];
  indices: number[];
  stats: {
    roadTiles: number;
    centreMarks: number;
    edgePatches: number;
    cracks: number;
    triangles: number;
  };
}

function hash(column: number, row: number, salt: number): number {
  const value = Math.sin(column * 127.1 + row * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function terrainIdAt(data: TerrainMapData, column: number, row: number): string {
  return data.legend[data.tiles[row]?.[column] ?? ''] ?? 'open';
}

function roadAt(data: TerrainMapData, column: number, row: number): boolean {
  return terrainIdAt(data, column, row) === 'road';
}

/** Local principal axis keeps dashes following wide and staircase roads. */
function roadAxis(data: TerrainMapData, column: number, row: number): Point {
  const samples: Point[] = [[0, 0]];
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      if ((dc !== 0 || dr !== 0) && roadAt(data, column + dc, row + dr)) {
        samples.push([dc, dr]);
      }
    }
  }

  let meanX = 0;
  let meanZ = 0;
  for (const [x, z] of samples) {
    meanX += x / samples.length;
    meanZ += z / samples.length;
  }
  let xx = 0;
  let xz = 0;
  let zz = 0;
  for (const [x, z] of samples) {
    const dx = x - meanX;
    const dz = z - meanZ;
    const weight = 1 / (1 + Math.hypot(dx, dz) * 0.3);
    xx += dx * dx * weight;
    xz += dx * dz * weight;
    zz += dz * dz * weight;
  }

  if (xx + zz < 0.001) {
    return hash(column, row, 19) < 0.5 ? [1, 0] : [0, 1];
  }
  const angle = 0.5 * Math.atan2(2 * xz, xx - zz);
  return [Math.cos(angle), Math.sin(angle)];
}

function coloured(
  target: number[],
  hex: number,
  count: number,
  tint: { colour: Color; strength: number } | null,
): void {
  const colour = new Color(hex);
  if (tint !== null) {
    colour.lerp(tint.colour, Math.max(0, Math.min(1, tint.strength)));
  }
  for (let index = 0; index < count; index += 1) {
    target.push(colour.r, colour.g, colour.b);
  }
}

function addVertices(
  geometry: RoadWearGeometry,
  points: readonly Point[],
  lift: number,
  colour: number,
  heightAt: (x: number, y: number) => number,
  tint: { colour: Color; strength: number } | null,
): number {
  const start = geometry.positions.length / 3;
  for (const [x, z] of points) geometry.positions.push(x, heightAt(x, z) + lift, z);
  coloured(geometry.colours, colour, points.length, tint);
  return start;
}

function addTriangleIndices(
  indices: number[],
  points: readonly Point[],
  start: number,
  a: number,
  b: number,
  c: number,
): void {
  const pa = points[a];
  const pb = points[b];
  const pc = points[c];
  if (pa === undefined || pb === undefined || pc === undefined) return;
  const crossY = (pb[1] - pa[1]) * (pc[0] - pa[0])
    - (pb[0] - pa[0]) * (pc[1] - pa[1]);
  if (crossY >= 0) indices.push(start + a, start + b, start + c);
  else indices.push(start + a, start + c, start + b);
}

function addQuad(
  geometry: RoadWearGeometry,
  points: readonly [Point, Point, Point, Point],
  lift: number,
  colour: number,
  heightAt: (x: number, y: number) => number,
  tint: { colour: Color; strength: number } | null,
): void {
  const start = addVertices(geometry, points, lift, colour, heightAt, tint);
  addTriangleIndices(geometry.indices, points, start, 0, 1, 2);
  addTriangleIndices(geometry.indices, points, start, 0, 2, 3);
}

function addCentreMark(
  geometry: RoadWearGeometry,
  data: TerrainMapData,
  column: number,
  row: number,
  heightAt: (x: number, y: number) => number,
  tint: { colour: Color; strength: number } | null,
): void {
  const size = data.tileSize;
  const [axisX, axisZ] = roadAxis(data, column, row);
  const sideX = -axisZ;
  const sideZ = axisX;
  const centreX = (column + 0.5) * size
    + axisX * (hash(column, row, 101) - 0.5) * size * 0.1
    + sideX * (hash(column, row, 103) - 0.5) * size * 0.08;
  const centreZ = (row + 0.5) * size
    + axisZ * (hash(column, row, 101) - 0.5) * size * 0.1
    + sideZ * (hash(column, row, 103) - 0.5) * size * 0.08;
  const halfLength = size * (0.22 + hash(column, row, 107) * 0.1);
  const halfWidth = size * (0.025 + hash(column, row, 109) * 0.018);
  const point = (along: number, across: number): Point => [
    centreX + axisX * along + sideX * across,
    centreZ + axisZ * along + sideZ * across,
  ];
  addQuad(
    geometry,
    [
      point(-halfLength, -halfWidth),
      point(halfLength, -halfWidth),
      point(halfLength, halfWidth),
      point(-halfLength, halfWidth),
    ],
    ROAD_LIFT,
    shade(TERRAIN_COLOURS.road ?? 0x59513f, 1.16 + hash(column, row, 113) * 0.08),
    heightAt,
    tint,
  );
  geometry.stats.centreMarks += 1;
}

function edgePatchPoints(
  data: TerrainMapData,
  column: number,
  row: number,
  edge: RoadEdge,
): readonly [Point, Point, Point] {
  const size = data.tileSize;
  const centreX = (column + 0.5) * size;
  const centreZ = (row + 0.5) * size;
  const along = (hash(column, row, edge.salt + 1) - 0.5) * size * 0.58;
  const halfSpan = size * (0.055 + hash(column, row, edge.salt + 2) * 0.075);
  const depth = size * (0.07 + hash(column, row, edge.salt + 3) * 0.09);
  const tipJitter = (hash(column, row, edge.salt + 4) - 0.5) * halfSpan;
  const inset = size * 0.012;

  if (edge.dr !== 0) {
    const borderZ = edge.dr < 0 ? row * size + inset : (row + 1) * size - inset;
    return [
      [centreX + along - halfSpan, borderZ],
      [centreX + along + halfSpan, borderZ],
      [centreX + along + tipJitter, borderZ - edge.dr * depth],
    ];
  }
  const borderX = edge.dc < 0 ? column * size + inset : (column + 1) * size - inset;
  return [
    [borderX, centreZ + along - halfSpan],
    [borderX, centreZ + along + halfSpan],
    [borderX - edge.dc * depth, centreZ + along + tipJitter],
  ];
}

function addEdgePatches(
  geometry: RoadWearGeometry,
  data: TerrainMapData,
  column: number,
  row: number,
  heightAt: (x: number, y: number) => number,
  tint: { colour: Color; strength: number } | null,
): void {
  const candidates = CARDINAL_EDGES
    .filter((edge) => !roadAt(data, column + edge.dc, row + edge.dr))
    .map((edge) => ({ edge, score: hash(column, row, edge.salt) }))
    .filter(({ score }) => score < 0.72)
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_EDGE_PATCHES_PER_TILE);

  for (const { edge } of candidates) {
    const points = edgePatchPoints(data, column, row, edge);
    const neighbour = terrainIdAt(data, column + edge.dc, row + edge.dr);
    const colour = shade(
      TERRAIN_COLOURS[neighbour] ?? TERRAIN_COLOURS.open ?? 0x3c4a33,
      0.88 + hash(column, row, edge.salt + 5) * 0.2,
    );
    const start = addVertices(geometry, points, EDGE_LIFT, colour, heightAt, tint);
    addTriangleIndices(geometry.indices, points, start, 0, 1, 2);
    geometry.stats.edgePatches += 1;
  }
}

function addCrack(
  geometry: RoadWearGeometry,
  data: TerrainMapData,
  column: number,
  row: number,
  heightAt: (x: number, y: number) => number,
  tint: { colour: Color; strength: number } | null,
): void {
  if (hash(column, row, 173) >= 0.2) return;
  const size = data.tileSize;
  const [roadX, roadZ] = roadAxis(data, column, row);
  const jitter = (hash(column, row, 179) - 0.5) * 0.7;
  const axisX = -roadZ * Math.cos(jitter) - roadX * Math.sin(jitter);
  const axisZ = roadX * Math.cos(jitter) - roadZ * Math.sin(jitter);
  const sideX = -axisZ;
  const sideZ = axisX;
  const centreX = (column + 0.5) * size
    + (hash(column, row, 181) - 0.5) * size * 0.34;
  const centreZ = (row + 0.5) * size
    + (hash(column, row, 191) - 0.5) * size * 0.34;
  const halfLength = size * (0.1 + hash(column, row, 193) * 0.09);
  const halfWidth = size * (0.006 + hash(column, row, 197) * 0.005);
  const point = (along: number, across: number): Point => [
    centreX + axisX * along + sideX * across,
    centreZ + axisZ * along + sideZ * across,
  ];
  addQuad(
    geometry,
    [
      point(-halfLength, -halfWidth),
      point(halfLength, -halfWidth),
      point(halfLength, halfWidth),
      point(-halfLength, halfWidth),
    ],
    CRACK_LIFT,
    shade(TERRAIN_COLOURS.road ?? 0x59513f, 0.42),
    heightAt,
    tint,
  );
  geometry.stats.cracks += 1;
}

/** Static wear shares the terrain draw while keeping its interactive height untouched. */
export function buildRoadWear(
  data: TerrainMapData,
  heightAt: (x: number, y: number) => number,
  tint: { colour: Color; strength: number } | null,
): RoadWearGeometry {
  const geometry: RoadWearGeometry = {
    positions: [],
    colours: [],
    indices: [],
    stats: { roadTiles: 0, centreMarks: 0, edgePatches: 0, cracks: 0, triangles: 0 },
  };

  for (let row = 0; row < data.height; row += 1) {
    for (let column = 0; column < data.width; column += 1) {
      if (!roadAt(data, column, row)) continue;
      geometry.stats.roadTiles += 1;
      addCentreMark(geometry, data, column, row, heightAt, tint);
      addEdgePatches(geometry, data, column, row, heightAt, tint);
      addCrack(geometry, data, column, row, heightAt, tint);
    }
  }
  geometry.stats.triangles = geometry.indices.length / 3;
  return geometry;
}
