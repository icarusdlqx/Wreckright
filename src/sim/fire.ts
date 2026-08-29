import type { TerrainFireRules } from '../schema/rules';
import { emit } from './events';
import { addHeat } from './heat';
import { isOperational, type Vec2, type World } from './types';

export type FirePhase = 'burning' | 'burnt';
export type IgnitionSource = 'incendiary_hit' | 'ammo_explosion' | 'artillery_impact';

export interface FireCell {
  phase: FirePhase;
  startedTick: number;
  burnoutTick: number;
  nextSpreadTick: number;
}

export interface IgnitionRequest {
  cell: number;
  source: IgnitionSource;
  chance: number;
}

export interface FireState {
  cells: Map<number, FireCell>;
  pendingIgnitions: IgnitionRequest[];
  revision: number;
}

interface IgnitionProposal {
  cell: number;
  chances: number[];
}

const NEIGHBOURS = [
  { column: 1, row: 0 },
  { column: 0, row: 1 },
  { column: -1, row: 0 },
  { column: 0, row: -1 },
] as const;

export function createFireState(): FireState {
  return { cells: new Map(), pendingIgnitions: [], revision: 0 };
}

function chanceFor(rules: TerrainFireRules, source: IgnitionSource): number {
  if (source === 'incendiary_hit') return rules.ignitionChance.incendiaryHit;
  if (source === 'ammo_explosion') return rules.ignitionChance.ammoExplosion;
  return rules.ignitionChance.artilleryImpact;
}

function cellAt(world: World, point: Vec2): number | null {
  const tile = world.terrain.toTile(point);
  if (!world.terrain.inBounds(tile.column, tile.row)) return null;
  return tile.row * world.terrain.width + tile.column;
}

function isBurnable(world: World, cell: number): boolean {
  if (world.fire.cells.has(cell)) return false;
  const column = cell % world.terrain.width;
  const row = Math.floor(cell / world.terrain.width);
  const terrainId = world.terrain.idAt(column, row);
  return world.rules.terrain.fire.burnsTo[terrainId] !== undefined;
}

export function queueIgnition(world: World, at: Vec2, source: IgnitionSource): void {
  const cell = cellAt(world, at);
  if (cell === null || !isBurnable(world, cell)) return;
  world.fire.pendingIgnitions.push({
    cell,
    source,
    chance: chanceFor(world.rules.terrain.fire, source),
  });
}

function addProposal(proposals: Map<number, IgnitionProposal>, cell: number, chance: number): void {
  const existing = proposals.get(cell);
  if (existing === undefined) proposals.set(cell, { cell, chances: [chance] });
  else existing.chances.push(chance);
}

function spreadChance(world: World, columnDelta: number, rowDelta: number): number {
  const rules = world.rules.terrain.fire;
  const wind = world.atmosphere.mechanics.wind;
  const projection =
    (wind.x * columnDelta + wind.y * rowDelta) / Math.max(1, Math.hypot(wind.x, wind.y));
  return Math.min(1, rules.baseSpreadChance + rules.windSpreadChance * Math.max(0, projection));
}

function collectSpread(world: World, burning: readonly [number, FireCell][]): Map<number, IgnitionProposal> {
  const proposals = new Map<number, IgnitionProposal>();
  const intervalTicks = Math.max(1, Math.round(world.rules.terrain.fire.spreadIntervalSeconds / world.dt));

  for (const [cell, state] of burning) {
    if (world.tick < state.nextSpreadTick) continue;
    state.nextSpreadTick = world.tick + intervalTicks;
    const column = cell % world.terrain.width;
    const row = Math.floor(cell / world.terrain.width);
    for (const offset of NEIGHBOURS) {
      const targetColumn = column + offset.column;
      const targetRow = row + offset.row;
      if (!world.terrain.inBounds(targetColumn, targetRow)) continue;
      const targetCell = targetRow * world.terrain.width + targetColumn;
      if (!isBurnable(world, targetCell)) continue;
      addProposal(proposals, targetCell, spreadChance(world, offset.column, offset.row));
    }
  }
  return proposals;
}

function burnOut(world: World, burning: readonly [number, FireCell][]): void {
  for (const [cell, state] of burning) {
    if (world.tick < state.burnoutTick) continue;
    const column = cell % world.terrain.width;
    const row = Math.floor(cell / world.terrain.width);
    const sourceId = world.terrain.idAt(column, row);
    const destinationId = world.rules.terrain.fire.burnsTo[sourceId];
    if (destinationId === undefined || !world.terrain.replaceTypeAt(column, row, destinationId)) continue;
    world.fire.cells.set(cell, { ...state, phase: 'burnt' });
    world.fire.revision += 1;
    emit(world.events, { type: 'terrain_burned', tick: world.tick, cell });
  }
}

function combinedChance(chances: number[]): number {
  chances.sort((a, b) => a - b);
  let miss = 1;
  for (const chance of chances) miss *= 1 - chance;
  return 1 - miss;
}

function igniteProposals(world: World, proposals: Map<number, IgnitionProposal>): void {
  const successes: number[] = [];
  for (const proposal of [...proposals.values()].sort((a, b) => a.cell - b.cell)) {
    if (!isBurnable(world, proposal.cell)) continue;
    if (world.rng.chance(combinedChance(proposal.chances))) successes.push(proposal.cell);
  }

  const burningCount = [...world.fire.cells.values()].filter((cell) => cell.phase === 'burning').length;
  const capacity = Math.max(0, world.rules.terrain.fire.maxBurningTiles - burningCount);
  const burnTicks = Math.max(1, Math.round(world.rules.terrain.fire.burnSeconds / world.dt));
  const spreadTicks = Math.max(1, Math.round(world.rules.terrain.fire.spreadIntervalSeconds / world.dt));
  for (const cell of successes.slice(0, capacity)) {
    world.fire.cells.set(cell, {
      phase: 'burning',
      startedTick: world.tick,
      burnoutTick: world.tick + burnTicks,
      nextSpreadTick: world.tick + spreadTicks,
    });
    world.fire.revision += 1;
    emit(world.events, { type: 'terrain_ignited', tick: world.tick, cell });
  }
}

function heatStandingMechs(world: World, burning: readonly [number, FireCell][]): void {
  if (world.rules.terrain.fire.heatPerSecond === 0) return;
  const burningCells = new Set(burning.map(([cell]) => cell));
  for (const entity of world.entities) {
    if (!isOperational(entity) || entity.jump !== null) continue;
    const cell = cellAt(world, entity.pos);
    if (cell !== null && burningCells.has(cell)) {
      addHeat(entity, world.rules.terrain.fire.heatPerSecond * world.dt);
    }
  }
}

export function updateFire(world: World): void {
  const burning = [...world.fire.cells.entries()]
    .filter((entry): entry is [number, FireCell] => entry[1].phase === 'burning')
    .sort((a, b) => a[0] - b[0]);
  if (burning.length === 0 && world.fire.pendingIgnitions.length === 0) return;

  heatStandingMechs(world, burning);
  const proposals = collectSpread(world, burning);
  for (const request of world.fire.pendingIgnitions) {
    if (isBurnable(world, request.cell)) addProposal(proposals, request.cell, request.chance);
  }
  world.fire.pendingIgnitions.length = 0;

  // A dying flame gets its last heat and spread pulse before the fuel is gone.
  burnOut(world, burning);
  igniteProposals(world, proposals);
}
