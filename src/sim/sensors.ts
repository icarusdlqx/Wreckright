import type { SensorRules } from '../schema/rules';
import { abilityFactor } from './abilities';
import { lineOfSight } from './los';
import { distance } from './math';
import { isOperational, type EntityId, type MechEntity, type Vec2, type World } from './types';

export interface Ghost {
  pos: Vec2;
  tick: number;
  team: number;
}

export type ContactSource = 'sensor' | 'optical';

/** The only enemy facts an electronic return is allowed to disclose. */
export interface ContactTrack {
  id: EntityId;
  team: number;
  frame: MechEntity['frame'];
  chassisClass: MechEntity['chassisClass'];
  pos: Vec2;
  tick: number;
  source: ContactSource;
}

interface OpticalFootprint {
  key: string;
  cells: Uint32Array;
}

export interface TeamVision {
  team: number;
  /** Enemies the team can resolve optically and therefore fight. */
  visible: Set<EntityId>;
  /** Compatibility name: optical sight always identifies in this first pass. */
  identified: Set<EntityId>;
  /** Current electronic returns. These are not firing solutions. */
  detected: Set<EntityId>;
  /** Current or remembered privacy-safe contact reports. */
  tracks: Map<EntityId, ContactTrack>;
  /** Enemy hulks actually seen after they stopped; explored ground is insufficient. */
  observedHulks: Set<EntityId>;
  ghosts: Map<EntityId, Ghost>;
  tiles: Uint8Array;
  explored: Uint8Array;
  /** Cached because vision refreshes twice per simulation tick. */
  opticalFootprints: Map<EntityId, OpticalFootprint>;
}

export function sensorRangeFor(rules: SensorRules, sensorSkill: number): number {
  return rules.baseRange + rules.rangePerSkill * sensorSkill;
}

export function sightRangeFor(rules: SensorRules, sensorSkill: number): number {
  return rules.sightBaseRange + rules.sightRangePerSkill * sensorSkill;
}

/**
 * Mass is the baseline return; frame, hull and equipment apply at spawn.
 */
export function signatureFor(rules: SensorRules, tonnage: number): number {
  return rules.signatureBase + rules.signaturePerTon * tonnage;
}

export function createVision(world: World, team: number): TeamVision {
  const cells = world.terrain.width * world.terrain.height;
  return {
    team,
    visible: new Set(),
    identified: new Set(),
    detected: new Set(),
    tracks: new Map(),
    observedHulks: new Set(),
    ghosts: new Map(),
    tiles: new Uint8Array(cells),
    explored: new Uint8Array(cells),
    opticalFootprints: new Map(),
  };
}

/** The sensor picture a controller on this team is allowed to reason from. */
export function visionFor(world: World, team: number): TeamVision | null {
  // Tests and UI tools sometimes replace the public player view deliberately;
  // honour that alias before consulting the internal controller map.
  if (world.vision?.team === team) return world.vision;
  return world.visions.get(team) ?? null;
}

/** Refreshes every side before any controller gets to make a decision. */
export function updateTeamVisions(world: World): void {
  // Scripted and support spawns can introduce a side that was not present at
  // world creation. Give it a picture before its controller gets its first
  // decision; a missing map is deliberately "omniscient" for low-level tools.
  for (const entity of world.entities) {
    if (!world.visions.has(entity.team)) {
      world.visions.set(entity.team, createVision(world, entity.team));
    }
  }

  // The UI/test-facing player alias can be replaced without replacing the
  // internal map entry. Refresh each distinct picture exactly once.
  const updated = new Set<TeamVision>();
  if (world.vision !== null) {
    updateVision(world, world.vision);
    updated.add(world.vision);
  }
  for (const vision of world.visions.values()) {
    if (updated.has(vision)) continue;
    updateVision(world, vision);
  }
}

function markCircle(world: World, vision: TeamVision, at: Vec2, range: number): void {
  const { terrain } = world;
  const radius = Math.ceil(range / terrain.tileSize);
  const centre = terrain.toTile(at);

  for (let row = centre.row - radius; row <= centre.row + radius; row += 1) {
    for (let column = centre.column - radius; column <= centre.column + radius; column += 1) {
      if (!terrain.inBounds(column, row)) continue;
      if (distance(at, terrain.tileCentre(column, row)) > range) continue;
      const cell = row * terrain.width + column;
      vision.tiles[cell] = 1;
      vision.explored[cell] = 1;
    }
  }
}

function footprintFor(world: World, vision: TeamVision, observer: MechEntity): Uint32Array {
  const { terrain } = world;
  const tile = terrain.toTile(observer.pos);
  const vantage = vantageOf(world, observer);
  const key = `${tile.column}:${tile.row}:${observer.sightRange}:${vantage}`;
  const cached = vision.opticalFootprints.get(observer.id);
  if (cached?.key === key) return cached.cells;

  const origin = terrain.tileCentre(tile.column, tile.row);
  const targetFactors = Object.values(world.rules.terrain.types).map((type) => type.visionFactor);
  const maximumTargetFactor = Math.max(1, ...targetFactors);
  const maximumReach = observer.sightRange * vantage * maximumTargetFactor;
  const radius = Math.ceil(maximumReach / terrain.tileSize);
  const cells: number[] = [];

  for (let row = tile.row - radius; row <= tile.row + radius; row += 1) {
    for (let column = tile.column - radius; column <= tile.column + radius; column += 1) {
      if (!terrain.inBounds(column, row)) continue;
      const target = terrain.tileCentre(column, row);
      const reach = observer.sightRange * vantage * terrain.typeAt(column, row).visionFactor;
      if (distance(origin, target) > reach) continue;
      if (!lineOfSight(terrain, origin, target).clear) continue;
      cells.push(row * terrain.width + column);
    }
  }

  const footprint = Uint32Array.from(cells);
  vision.opticalFootprints.set(observer.id, { key, cells: footprint });
  return footprint;
}

function markObserverFootprint(world: World, vision: TeamVision, observer: MechEntity): void {
  for (const cell of footprintFor(world, vision, observer)) {
    vision.tiles[cell] = 1;
    vision.explored[cell] = 1;
  }
}

function withinSweep(candidate: MechEntity, sweeps: World['reveals']): boolean {
  return sweeps.some(
    (sweep) => distance(candidate.pos, { x: sweep.x, y: sweep.y }) <= sweep.radius,
  );
}

function sensorDetects(world: World, observer: MechEntity, candidate: MechEntity): boolean {
  const concealment = world.terrain.typeAtPoint(candidate.pos).signatureFactor;
  const reach =
    observer.sensorRange *
    candidate.signature *
    concealment *
    abilityFactor(world, observer, 'sensor');
  return distance(observer.pos, candidate.pos) <= reach;
}

function opticallySights(world: World, observer: MechEntity, candidate: MechEntity): boolean {
  const targetTerrain = world.terrain.typeAtPoint(candidate.pos).visionFactor;
  const reach = observer.sightRange * vantageOf(world, observer) * targetTerrain;
  if (distance(observer.pos, candidate.pos) > reach) return false;
  return lineOfSight(world.terrain, observer.pos, candidate.pos).clear;
}

/** A stable cell-centre report prevents sensors leaking sub-cell movement. */
export function quantizeTrackPosition(point: Vec2, gridMetres: number): Vec2 {
  return {
    x: Math.floor(point.x / gridMetres) * gridMetres + gridMetres / 2,
    y: Math.floor(point.y / gridMetres) * gridMetres + gridMetres / 2,
  };
}

function rememberContact(
  world: World,
  vision: TeamVision,
  candidate: MechEntity,
  source: ContactSource,
): void {
  const coarse = quantizeTrackPosition(candidate.pos, world.rules.sensors.trackGridMetres);
  vision.tracks.set(candidate.id, {
    id: candidate.id,
    team: candidate.team,
    frame: candidate.frame,
    chassisClass: candidate.chassisClass,
    pos: coarse,
    tick: world.tick,
    source,
  });
  vision.ghosts.set(candidate.id, {
    pos: source === 'optical' ? { x: candidate.pos.x, y: candidate.pos.y } : coarse,
    tick: world.tick,
    team: candidate.team,
  });
}

function observeHulk(vision: TeamVision, id: EntityId): void {
  vision.observedHulks.add(id);
  vision.tracks.delete(id);
  vision.ghosts.delete(id);
}

function rememberObservedHulks(world: World, vision: TeamVision): void {
  for (const candidate of world.entities) {
    if (candidate.team === vision.team || (!candidate.destroyed && !candidate.withdrawn)) continue;
    const tile = world.terrain.toTile(candidate.pos);
    if (!world.terrain.inBounds(tile.column, tile.row)) continue;
    const cell = tile.row * world.terrain.width + tile.column;
    if (vision.tiles[cell] === 1) observeHulk(vision, candidate.id);
  }
}

/** Commits terminal knowledge while the side still has a current optical solution. */
export function rememberObservedStops(world: World): void {
  const visions = new Set(world.visions.values());
  if (world.vision !== null) visions.add(world.vision);
  for (const vision of visions) {
    for (const id of vision.visible) {
      const candidate = world.entities.find((entity) => entity.id === id);
      if (
        candidate !== undefined &&
        candidate.team !== vision.team &&
        (candidate.destroyed || candidate.withdrawn)
      ) {
        observeHulk(vision, id);
      }
    }
  }
}

export function updateVision(world: World, vision: TeamVision): void {
  vision.tiles.fill(0);
  vision.visible.clear();
  vision.identified.clear();
  vision.detected.clear();

  const observers = world.entities.filter(
    (entity) => entity.team === vision.team && isOperational(entity),
  );
  const observerIds = new Set(observers.map((observer) => observer.id));
  for (const id of vision.opticalFootprints.keys()) {
    if (!observerIds.has(id)) vision.opticalFootprints.delete(id);
  }
  for (const observer of observers) markObserverFootprint(world, vision, observer);

  const teamSweeps = world.reveals.filter((reveal) => reveal.team === vision.team);
  const opticalSweeps = teamSweeps.filter((reveal) => reveal.kind === 'optical');
  const sensorSweeps = teamSweeps.filter((reveal) => reveal.kind === 'sensor');
  for (const sweep of opticalSweeps) {
    markCircle(world, vision, { x: sweep.x, y: sweep.y }, sweep.radius);
  }
  rememberObservedHulks(world, vision);

  for (const candidate of world.entities) {
    if (candidate.team === vision.team || !isOperational(candidate)) continue;

    const sighted =
      withinSweep(candidate, opticalSweeps) ||
      observers.some((observer) => opticallySights(world, observer, candidate));
    const detected =
      withinSweep(candidate, sensorSweeps) ||
      observers.some((observer) => sensorDetects(world, observer, candidate));

    if (sighted) {
      vision.visible.add(candidate.id);
      vision.identified.add(candidate.id);
    }
    if (detected) vision.detected.add(candidate.id);
    if (sighted || detected) rememberContact(world, vision, candidate, sighted ? 'optical' : 'sensor');
  }

  const memoryTicks = world.rules.sensors.ghostMemorySeconds / world.dt;
  for (const [id, ghost] of vision.ghosts) {
    if (world.tick - ghost.tick > memoryTicks) vision.ghosts.delete(id);
  }
  for (const [id, track] of vision.tracks) {
    if (world.tick - track.tick > memoryTicks) vision.tracks.delete(id);
  }
}

export function isSightedBy(vision: TeamVision | null, entity: MechEntity): boolean {
  if (vision === null || entity.team === vision.team) return true;
  return vision.visible.has(entity.id);
}

export function isDetectedBy(vision: TeamVision | null, entity: MechEntity): boolean {
  if (vision === null || entity.team === vision.team) return true;
  return vision.detected.has(entity.id);
}

export function trackFor(
  vision: TeamVision | null,
  entityOrId: MechEntity | EntityId,
): ContactTrack | null {
  if (vision === null) return null;
  const id = typeof entityOrId === 'number' ? entityOrId : entityOrId.id;
  return vision.tracks.get(id) ?? null;
}

/** Temporary compatibility alias while callers migrate to intent-specific language. */
export function isVisibleTo(vision: TeamVision | null, entity: MechEntity): boolean {
  return isSightedBy(vision, entity);
}

export function isIdentifiedBy(vision: TeamVision | null, entity: MechEntity): boolean {
  return isSightedBy(vision, entity);
}

export function tileVisible(vision: TeamVision | null, cell: number): boolean {
  if (vision === null) return true;
  return vision.tiles[cell] === 1;
}

export function tileExplored(vision: TeamVision | null, cell: number): boolean {
  if (vision === null) return true;
  return vision.explored[cell] === 1;
}

/** Terrain under the observer and elevation determine how far its optics carry. */
export function vantageOf(world: World, observer: MechEntity): number {
  const ground = world.terrain.typeAtPoint(observer.pos).visionFactor;
  const height = world.terrain.elevationAtPoint(observer.pos);
  return ground * world.rules.combat.elevation.visionPerLevel ** height;
}
