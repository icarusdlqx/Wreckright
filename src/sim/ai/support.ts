import type { DifficultyTier } from '../../schema/rules';
import { clamp, distance } from '../math';
import { visionFor } from '../sensors';
import { callSupport, supportCost, type SupportCallId } from '../support';
import {
  isOperational,
  type EntityId,
  type MechEntity,
  type Vec2,
  type World,
} from '../types';

type DoctrineCall = Extract<
  SupportCallId,
  'artillery_strike' | 'air_strike' | 'sensor_probe' | 'repair_truck'
>;

interface SupportPlan {
  call: DoctrineCall;
  target: Vec2;
  heading: number;
  artilleryKey?: string;
  repairEntityId?: EntityId;
}

interface ArtillerySearch {
  activeKeys: Set<string>;
  plans: SupportPlan[];
}

export interface SupportDoctrineState {
  nextCallTickByTeam: Map<number, number>;
  artilleryPressureSinceTick: Map<string, number>;
  artilleryLatches: Set<string>;
  observedEnemyPositions: Map<string, { pos: Vec2; tick: number }>;
  repairHoldUntilTickByEntity: Map<EntityId, number>;
}

export function createSupportDoctrineState(): SupportDoctrineState {
  return {
    nextCallTickByTeam: new Map(),
    artilleryPressureSinceTick: new Map(),
    artilleryLatches: new Set(),
    observedEnemyPositions: new Map(),
    repairHoldUntilTickByEntity: new Map(),
  };
}

function tacticalLance(world: World, team: number): MechEntity[] {
  return world.entities
    .filter((entity) =>
      entity.team === team && entity.controller === 'tactical' && isOperational(entity),
    )
    .sort((a, b) => a.id - b.id);
}

/** Exact hostile positions are doctrine inputs only while this team can see them. */
function visibleEnemies(world: World, team: number): MechEntity[] {
  const vision = visionFor(world, team);
  if (vision === null) return [];
  return world.entities
    .filter((entity) =>
      entity.team !== team && isOperational(entity) && vision.visible.has(entity.id),
    )
    .sort((a, b) => a.id - b.id);
}

function centroid(entities: readonly MechEntity[]): Vec2 {
  const total = entities.reduce(
    (sum, entity) => ({ x: sum.x + entity.pos.x, y: sum.y + entity.pos.y }),
    { x: 0, y: 0 },
  );
  return { x: total.x / entities.length, y: total.y / entities.length };
}

/** Stable anchor clustering: the lowest-id anchor wins equal-sized groups. */
function largestCluster(entities: readonly MechEntity[], radius: number): MechEntity[] {
  let best: MechEntity[] = [];
  for (const anchor of entities) {
    const members = entities.filter((entity) => distance(anchor.pos, entity.pos) <= radius);
    if (members.length > best.length) best = members;
  }
  return best;
}

function insideAirRun(world: World, entity: MechEntity, target: Vec2, heading: number): boolean {
  const rules = world.rules.support.air_strike;
  const spacing = rules.length / rules.shots;
  const along = { x: Math.cos(heading), y: Math.sin(heading) };
  for (let shot = 0; shot < rules.shots; shot += 1) {
    const offset = -rules.length / 2 + spacing * (shot + 0.5);
    const centre = { x: target.x + along.x * offset, y: target.y + along.y * offset };
    if (distance(entity.pos, centre) <= rules.width / 2) return true;
  }
  return false;
}

function artillerySearch(world: World, team: number, enemies: readonly MechEntity[]): ArtillerySearch {
  const config = world.rules.ai.support.artillery;
  const activeKeys = new Set<string>();
  const plans: (SupportPlan & { contacts: number; held: number; zoneId: string })[] = [];
  const targetTeams = [...new Set(enemies.map((entity) => entity.team))].sort((a, b) => a - b);

  for (const zone of [...world.zones].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const targetTeam of targetTeams) {
      const occupants = enemies.filter((entity) =>
        entity.team === targetTeam &&
        entity.motion === 'stationary' &&
        distance(entity.pos, zone) <= zone.radius,
      );
      const cluster = largestCluster(occupants, config.clusterRadius);
      if (cluster.length < config.minimumContacts) continue;
      const key = `${team}:${zone.id}:${targetTeam}`;
      activeKeys.add(key);
      const since = world.aiSupport.artilleryPressureSinceTick.get(key) ?? world.tick;
      world.aiSupport.artilleryPressureSinceTick.set(key, since);
      const held = (world.tick - since) * world.dt;
      if (held < config.holdSeconds) continue;
      plans.push({
        call: 'artillery_strike',
        target: centroid(cluster),
        heading: 0,
        artilleryKey: key,
        contacts: cluster.length,
        held,
        zoneId: zone.id,
      });
    }
  }

  plans.sort((a, b) =>
    b.contacts - a.contacts || b.held - a.held ||
      a.zoneId.localeCompare(b.zoneId) ||
      (a.artilleryKey ?? '').localeCompare(b.artilleryKey ?? ''),
  );
  return { activeKeys, plans };
}

function airStrikePlan(world: World, team: number, enemies: readonly MechEntity[]): SupportPlan | null {
  const config = world.rules.ai.support.airStrike;
  const directions = new Map<EntityId, Vec2>();
  const prefix = `${team}:`;
  const visibleKeys = new Set<string>();
  for (const enemy of enemies) {
    const key = `${team}:${enemy.id}`;
    visibleKeys.add(key);
    const previous = world.aiSupport.observedEnemyPositions.get(key);
    const travelled = previous === undefined ? 0 : distance(previous.pos, enemy.pos);
    if (
      previous !== undefined &&
      previous.tick < world.tick &&
      enemy.motion !== 'stationary' &&
      travelled >= config.minimumAdvanceDistance
    ) {
      directions.set(enemy.id, {
        x: (enemy.pos.x - previous.pos.x) / travelled,
        y: (enemy.pos.y - previous.pos.y) / travelled,
      });
    }
    world.aiSupport.observedEnemyPositions.set(key, { pos: { ...enemy.pos }, tick: world.tick });
  }
  for (const key of world.aiSupport.observedEnemyPositions.keys()) {
    if (key.startsWith(prefix) && !visibleKeys.has(key)) {
      world.aiSupport.observedEnemyPositions.delete(key);
    }
  }
  const moving = enemies.filter((entity) => directions.has(entity.id));
  const cluster = largestCluster(moving, config.clusterRadius);
  if (cluster.length < config.minimumContacts) return null;

  const direction = cluster.reduce(
    (sum, entity) => ({
      x: sum.x + (directions.get(entity.id)?.x ?? 0),
      y: sum.y + (directions.get(entity.id)?.y ?? 0),
    }),
    { x: 0, y: 0 },
  );
  const alignment = Math.hypot(direction.x, direction.y) / cluster.length;
  if (alignment < config.advanceAlignment) return null;
  const heading = Math.atan2(direction.y, direction.x);
  const target = centroid(cluster);
  if (cluster.filter((entity) => insideAirRun(world, entity, target, heading)).length <
    config.minimumContacts) return null;
  return {
    call: 'air_strike',
    target,
    heading,
  };
}

function pointAlongPath(mech: MechEntity, lookAhead: number): Vec2 | null {
  let from = mech.pos;
  let remaining = lookAhead;
  let last: Vec2 | null = null;
  for (let index = mech.pathIndex; index < mech.path.length; index += 1) {
    const to = mech.path[index];
    if (to === undefined) break;
    const span = distance(from, to);
    last = to;
    if (span >= remaining && span > 0) {
      const fraction = remaining / span;
      return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
    }
    remaining -= span;
    from = to;
  }
  return last;
}

function sensorProbePlan(world: World, team: number, lance: readonly MechEntity[]): SupportPlan | null {
  if (
    world.support.pending.some((entry) => entry.team === team && entry.call === 'sensor_probe') ||
    world.reveals.some((entry) => entry.team === team && entry.kind === 'sensor')
  ) return null;
  const vision = visionFor(world, team);
  if (vision === null) return null;

  for (const mech of lance) {
    if (mech.intendedMotion === 'stationary') continue;
    const target = pointAlongPath(mech, world.rules.ai.support.sensorProbe.aheadDistance);
    if (target === null) continue;
    const tile = world.terrain.toTile(target);
    if (!world.terrain.inBounds(tile.column, tile.row)) continue;
    const cell = tile.row * world.terrain.width + tile.column;
    if (vision.tiles[cell] === 0) return { call: 'sensor_probe', target, heading: 0 };
  }
  return null;
}

function armourFraction(mech: MechEntity): number {
  let current = 0;
  let maximum = 0;
  for (const location of Object.values(mech.locations)) {
    if (location.destroyed) continue;
    current += location.armour + location.rearArmour;
    maximum += location.armourMax + location.rearArmourMax;
  }
  return maximum <= 0 ? 1 : current / maximum;
}

function pointBehind(world: World, mech: MechEntity, enemies: readonly MechEntity[]): Vec2 {
  const closest = [...enemies].sort((a, b) =>
    distance(mech.pos, a.pos) - distance(mech.pos, b.pos) || a.id - b.id,
  )[0];
  if (closest === undefined) return { ...mech.pos };
  const gap = Math.max(Number.EPSILON, distance(closest.pos, mech.pos));
  const margin = world.rules.ai.support.repairTruck.behindLineMargin;
  const extent = {
    x: world.terrain.width * world.terrain.tileSize,
    y: world.terrain.height * world.terrain.tileSize,
  };
  const behind = {
    x: clamp(mech.pos.x + ((mech.pos.x - closest.pos.x) / gap) * margin, 1, extent.x - 1),
    y: clamp(mech.pos.y + ((mech.pos.y - closest.pos.y) / gap) * margin, 1, extent.y - 1),
  };
  const tile = world.terrain.toTile(behind);
  return world.terrain.passable(tile.column, tile.row) ? behind : { ...mech.pos };
}

function repairPlan(
  world: World,
  team: number,
  lance: readonly MechEntity[],
  enemies: readonly MechEntity[],
): SupportPlan | null {
  if (
    world.support.pending.some((entry) => entry.team === team && entry.call === 'repair_truck') ||
    world.support.trucks.some((entry) => entry.team === team)
  ) return null;
  const config = world.rules.ai.support.repairTruck;
  const candidates = lance
    .filter((mech) =>
      mech.tonnage >= config.minimumTonnage &&
      mech.motion === 'stationary' &&
      mech.intendedMotion === 'stationary' &&
      mech.path.length === 0 &&
      armourFraction(mech) <= config.maximumArmourFraction &&
      enemies.every((enemy) => distance(mech.pos, enemy.pos) >= config.safeEnemyRange),
    )
    .sort((a, b) => armourFraction(a) - armourFraction(b) || a.id - b.id);
  const mech = candidates[0];
  if (mech === undefined) return null;
  return {
    call: 'repair_truck',
    target: pointBehind(world, mech, enemies),
    heading: 0,
    repairEntityId: mech.id,
  };
}

/** A repair call commits its recipient to the safe patch long enough to benefit. */
export function holdingForRepair(world: World, mech: MechEntity): boolean {
  const until = world.aiSupport.repairHoldUntilTickByEntity.get(mech.id);
  if (until === undefined) return false;
  const safe = world.tick < until && visibleEnemies(world, mech.team).every((enemy) =>
    distance(mech.pos, enemy.pos) >= world.rules.ai.support.repairTruck.safeEnemyRange,
  );
  if (!safe) world.aiSupport.repairHoldUntilTickByEntity.delete(mech.id);
  return safe;
}

function alreadyPending(world: World, team: number, call: DoctrineCall): boolean {
  return world.support.pending.some((entry) => entry.team === team && entry.call === call);
}

function canAfford(world: World, team: number, call: DoctrineCall): boolean {
  return (world.resources.get(team) ?? 0) - supportCost(world, call) >=
    world.rules.ai.support.minimumResourceReserve;
}

function clearTeamDoctrine(world: World, team: number): void {
  const prefix = `${team}:`;
  const nextCall = world.aiSupport.nextCallTickByTeam.get(team);
  if (nextCall !== undefined && nextCall <= world.tick) world.aiSupport.nextCallTickByTeam.delete(team);
  for (const key of world.aiSupport.artilleryPressureSinceTick.keys()) {
    if (key.startsWith(prefix)) world.aiSupport.artilleryPressureSinceTick.delete(key);
  }
  for (const key of world.aiSupport.artilleryLatches) {
    if (key.startsWith(prefix)) world.aiSupport.artilleryLatches.delete(key);
  }
  for (const key of world.aiSupport.observedEnemyPositions.keys()) {
    if (key.startsWith(prefix)) world.aiSupport.observedEnemyPositions.delete(key);
  }
  for (const id of world.aiSupport.repairHoldUntilTickByEntity.keys()) {
    const entity = world.entities.find((candidate) => candidate.id === id);
    if (entity === undefined || entity.team === team) {
      world.aiSupport.repairHoldUntilTickByEntity.delete(id);
    }
  }
}

/** One deterministic, fog-safe support choice per tactical doctrine pass. */
export function runSupportDoctrine(world: World, team: number, tier: DifficultyTier): void {
  if (!tier.usesSupport) return;
  const lance = tacticalLance(world, team);
  if (lance.length === 0) {
    clearTeamDoctrine(world, team);
    return;
  }
  for (const [id, until] of world.aiSupport.repairHoldUntilTickByEntity) {
    const held = world.entities.find((entity) => entity.id === id);
    if (
      held === undefined ||
      (held.team === team && (until <= world.tick || !lance.some((mech) => mech.id === id)))
    ) {
      world.aiSupport.repairHoldUntilTickByEntity.delete(id);
    }
  }
  const enemies = visibleEnemies(world, team);
  const artillery = artillerySearch(world, team, enemies);
  const airPlan = airStrikePlan(world, team, enemies);
  const prefix = `${team}:`;
  for (const key of world.aiSupport.artilleryPressureSinceTick.keys()) {
    if (key.startsWith(prefix) && !artillery.activeKeys.has(key)) {
      world.aiSupport.artilleryPressureSinceTick.delete(key);
    }
  }
  for (const key of world.aiSupport.artilleryLatches) {
    if (key.startsWith(prefix) && !artillery.activeKeys.has(key)) {
      world.aiSupport.artilleryLatches.delete(key);
    }
  }
  if (world.tick < (world.aiSupport.nextCallTickByTeam.get(team) ?? 0)) return;

  const artilleryPlan = artillery.plans.find((plan) =>
    plan.artilleryKey !== undefined && !world.aiSupport.artilleryLatches.has(plan.artilleryKey),
  ) ?? null;
  const plans = [
    artilleryPlan,
    airPlan,
    sensorProbePlan(world, team, lance),
    repairPlan(world, team, lance, enemies),
  ];
  for (const plan of plans) {
    if (plan === null || alreadyPending(world, team, plan.call) || !canAfford(world, team, plan.call)) {
      continue;
    }
    if (!callSupport(world, team, plan.call, plan.target, plan.heading).ok) continue;
    if (plan.artilleryKey !== undefined) world.aiSupport.artilleryLatches.add(plan.artilleryKey);
    if (plan.repairEntityId !== undefined) {
      const seconds = world.rules.support.repair_truck.delaySeconds +
        world.rules.ai.support.repairTruck.holdSeconds;
      world.aiSupport.repairHoldUntilTickByEntity.set(
        plan.repairEntityId,
        world.tick + Math.round(seconds / world.dt),
      );
    }
    world.aiSupport.nextCallTickByTeam.set(
      team,
      world.tick + Math.round(world.rules.ai.support.cooldownSeconds / world.dt),
    );
    return;
  }
}
