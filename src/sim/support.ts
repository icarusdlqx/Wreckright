import { LOCATIONS, type MechLocation } from '../schema/common';
import type { Deployment } from '../schema/mission';
import { applyDamage } from './damage';
import { emit } from './events';
import { bearing, distance } from './math';
import { addStabilityImpulse, impulseOf } from './stability';
import { spawnUnits } from './triggers';
import { isOperational, type MechEntity, type Vec2, type World } from './types';

export const SUPPORT_CALLS = [
  'sensor_probe',
  'artillery_strike',
  'air_strike',
  'repair_truck',
  'minelayer',
  'reinforcement',
] as const;

export type SupportCallId = (typeof SUPPORT_CALLS)[number];

/**
 * What the dropship offers the player, kept deliberately short: one eye, one
 * hammer, one wrench. The other calls still exist in the rules and resolve
 * fine — missions and future content can use them — but the palette stays
 * three buttons a commander can actually weigh mid-fight.
 */
export const PLAYER_CALLS: readonly SupportCallId[] = [
  'sensor_probe',
  'air_strike',
  'repair_truck',
];

export interface PendingCall {
  call: SupportCallId;
  team: number;
  target: Vec2;
  heading: number;
  resolveTick: number;
}

export interface RepairTruck {
  team: number;
  pos: Vec2;
  radius: number;
  armourPerSecond: number;
  expiresTick: number;
}

export interface Minefield {
  team: number;
  pos: Vec2;
  radius: number;
  mines: number;
  damage: number;
  expiresTick: number;
  triggered: number[];
}

export interface Reveal {
  /** Whose picture the sweep feeds. A probe must not light the map for the enemy. */
  team: number;
  /** Sensors report contacts; authored optical intel may also lift the fog. */
  kind: 'sensor' | 'optical';
  x: number;
  y: number;
  radius: number;
  expiresTick: number;
}

export interface SupportState {
  pending: PendingCall[];
  trucks: RepairTruck[];
  minefields: Minefield[];
}

export function createSupportState(): SupportState {
  return { pending: [], trucks: [], minefields: [] };
}

export function supportCost(world: World, call: SupportCallId): number {
  return world.rules.support[call].cost;
}

export interface CallResult {
  ok: boolean;
  reason: string | null;
}

export function callSupport(
  world: World,
  team: number,
  call: SupportCallId,
  target: Vec2,
  heading = 0,
): CallResult {
  if (world.finished) return { ok: false, reason: 'the mission is over' };

  const config = world.rules.support[call];
  const balance = world.resources.get(team) ?? 0;
  if (balance < config.cost) {
    return { ok: false, reason: `needs ${config.cost} RP, you have ${Math.floor(balance)}` };
  }

  const tile = world.terrain.toTile(target);
  if (!world.terrain.inBounds(tile.column, tile.row)) {
    return { ok: false, reason: 'that point is off the map' };
  }

  if (call === 'reinforcement' && world.reserves.length === 0) {
    return { ok: false, reason: 'the dropship has no reserves left' };
  }

  world.resources.set(team, balance - config.cost);
  world.support.pending.push({
    call,
    team,
    target: { x: target.x, y: target.y },
    heading,
    resolveTick: world.tick + Math.round(config.delaySeconds / world.dt),
  });

  emit(world.events, {
    type: 'support_called',
    tick: world.tick,
    team,
    call,
    x: target.x,
    y: target.y,
    cost: config.cost,
  });

  return { ok: true, reason: null };
}

/** Overhead fire keeps its authored weights, but only among locations this frame actually has. */
export function supportHitTable(
  world: World,
  target: MechEntity,
): readonly { value: MechLocation; weight: number }[] {
  const active = new Set(
    Object.values(world.arcHitTables[target.frame].tables).flatMap((table) =>
      table.map((entry) => entry.value),
    ),
  );
  return world.hitLocationTable.filter((entry) => active.has(entry.value));
}

function damageAt(world: World, team: number, point: Vec2, radius: number, damage: number): void {
  for (const entity of world.entities) {
    if (entity.team === team || !isOperational(entity)) continue;
    if (distance(entity.pos, point) > radius) continue;
    const location = world.rng.weighted(supportHitTable(world, entity));
    const absorbed = applyDamage(world, entity, location, damage);
    entity.stats.damageTaken += absorbed;
    // A shell coming down has no recoil to speak of and no arc — it just lands
    // heavily enough to matter, and the impact floor decides whether it does.
    addStabilityImpulse(world, entity, impulseOf(world.rules.stability, absorbed, null));
  }
}

function resolveArtillery(world: World, pending: PendingCall): void {
  const config = world.rules.support.artillery_strike;
  for (let shot = 0; shot < config.shots; shot += 1) {
    const angle = world.rng.range(0, Math.PI * 2);
    const spread = world.rng.range(0, config.scatter);
    const point = {
      x: pending.target.x + Math.cos(angle) * spread,
      y: pending.target.y + Math.sin(angle) * spread,
    };
    damageAt(world, pending.team, point, config.radius, config.damage);
  }
}

/**
 * The aircraft rakes the ground along its heading rather than dropping one flat
 * rectangle of damage: `shots` bursts walk down the length of the run, so a mech
 * square on the line is caught by more than one and a mech clipping the edge is
 * caught by none. The bursts are half a width across and spaced closer than that,
 * which keeps the centre line unbroken while the flanks taper off.
 */
function resolveAirStrike(world: World, pending: PendingCall): void {
  const config = world.rules.support.air_strike;
  const along = { x: Math.cos(pending.heading), y: Math.sin(pending.heading) };
  const spacing = config.length / config.shots;

  for (let shot = 0; shot < config.shots; shot += 1) {
    const offset = -config.length / 2 + spacing * (shot + 0.5);
    damageAt(
      world,
      pending.team,
      {
        x: pending.target.x + along.x * offset,
        y: pending.target.y + along.y * offset,
      },
      config.width / 2,
      config.damage,
    );
  }
}

function resolveReinforcement(world: World, pending: PendingCall): void {
  const reserve = world.reserves.shift();
  if (reserve === undefined) return;

  spawnUnits(world, pending.team, [
    {
      designId: reserve.designId,
      pilotId: reserve.pilotId,
      spawn: pending.target,
      facingDegrees: reserve.facingDegrees,
    },
  ]);
}

function resolvePending(world: World, pending: PendingCall): void {
  const config = world.rules.support;

  switch (pending.call) {
    case 'sensor_probe':
      world.reveals.push({
        team: pending.team,
        kind: 'sensor',
        x: pending.target.x,
        y: pending.target.y,
        radius: config.sensor_probe.radius,
        expiresTick: world.tick + Math.round(config.sensor_probe.durationSeconds / world.dt),
      });
      break;

    case 'artillery_strike':
      resolveArtillery(world, pending);
      break;

    case 'air_strike':
      resolveAirStrike(world, pending);
      break;

    case 'repair_truck':
      world.support.trucks.push({
        team: pending.team,
        pos: pending.target,
        radius: config.repair_truck.radius,
        armourPerSecond: config.repair_truck.armourPerSecond,
        expiresTick: world.tick + Math.round(config.repair_truck.durationSeconds / world.dt),
      });
      break;

    case 'minelayer':
      world.support.minefields.push({
        team: pending.team,
        pos: pending.target,
        radius: config.minelayer.radius,
        mines: config.minelayer.mines,
        damage: config.minelayer.damage,
        expiresTick: world.tick + Math.round(config.minelayer.durationSeconds / world.dt),
        triggered: [],
      });
      break;

    case 'reinforcement':
      resolveReinforcement(world, pending);
      break;
  }

  emit(world.events, {
    type: 'support_resolved',
    tick: world.tick,
    team: pending.team,
    call: pending.call,
    x: pending.target.x,
    y: pending.target.y,
  });
}

function repairWithin(world: World, truck: RepairTruck): void {
  for (const entity of world.entities) {
    if (entity.team !== truck.team || !isOperational(entity)) continue;
    if (distance(entity.pos, truck.pos) > truck.radius) continue;
    topUpArmour(entity, truck.armourPerSecond * world.dt);
  }
}

type ArmourField = 'armour' | 'rearArmour';
type ArmourMaximum = 'armourMax' | 'rearArmourMax';

/** Shares one authored repair budget across every surviving, damaged plate. */
export function topUpArmour(entity: MechEntity, points: number): number {
  let remaining = Number.isFinite(points) ? Math.max(0, points) : 0;
  const budget = remaining;
  let plates: { field: ArmourField; maximum: ArmourMaximum; location: MechLocation }[] = [];

  for (const location of LOCATIONS) {
    const state = entity.locations[location];
    if (state.destroyed) continue;
    if (state.armour < state.armourMax) {
      plates.push({ field: 'armour', maximum: 'armourMax', location });
    }
    if (state.rearArmour < state.rearArmourMax) {
      plates.push({ field: 'rearArmour', maximum: 'rearArmourMax', location });
    }
  }

  while (remaining > 0 && plates.length > 0) {
    const share = remaining / plates.length;
    let spent = 0;
    const stillDamaged: typeof plates = [];
    for (const plate of plates) {
      const state = entity.locations[plate.location];
      const missing = Math.max(0, state[plate.maximum] - state[plate.field]);
      const applied = Math.min(share, missing);
      state[plate.field] += applied;
      spent += applied;
      if (missing - applied > Number.EPSILON) stillDamaged.push(plate);
    }
    if (spent <= Number.EPSILON) break;
    remaining = Math.max(0, remaining - spent);
    plates = stillDamaged;
  }

  return budget - remaining;
}

function detonateMines(world: World): void {
  for (const field of world.support.minefields) {
    if (field.mines <= 0) continue;

    for (const entity of world.entities) {
      if (entity.team === field.team || !isOperational(entity)) continue;
      if (field.triggered.includes(entity.id)) continue;
      if (distance(entity.pos, field.pos) > field.radius) continue;

      field.triggered.push(entity.id);
      field.mines -= 1;

      const location = world.rng.weighted(supportHitTable(world, entity));
      const absorbed = applyDamage(world, entity, location, field.damage);
      entity.stats.damageTaken += absorbed;
      addStabilityImpulse(world, entity, impulseOf(world.rules.stability, absorbed, null));
      if (field.mines <= 0) break;
    }
  }
}

export function updateSupport(world: World): void {
  const stillPending: PendingCall[] = [];
  for (const pending of world.support.pending) {
    if (pending.resolveTick > world.tick) {
      stillPending.push(pending);
      continue;
    }
    resolvePending(world, pending);
  }
  world.support.pending = stillPending;

  for (const truck of world.support.trucks) repairWithin(world, truck);
  world.support.trucks = world.support.trucks.filter((truck) => truck.expiresTick > world.tick);

  detonateMines(world);
  world.support.minefields = world.support.minefields.filter(
    (field) => field.expiresTick > world.tick && field.mines > 0,
  );

  world.reveals = world.reveals.filter((reveal) => reveal.expiresTick > world.tick);
}

export function revealedAt(world: World, point: Vec2): boolean {
  return world.reveals.some((reveal) => distance(point, { x: reveal.x, y: reveal.y }) <= reveal.radius);
}

export function headingBetween(from: Vec2, to: Vec2): number {
  return bearing(from, to);
}

/**
 * A call that runs along a line rather than sitting on a point, so the caller
 * has to say which way it goes. Read off the rules instead of listing ids here,
 * so a new strafing call is directional the moment its data says it has a length.
 */
export function isDirectional(world: World, call: SupportCallId): boolean {
  return 'length' in world.rules.support[call];
}

export function reservesFrom(mission: { reserves?: Deployment[] }): Deployment[] {
  return [...(mission.reserves ?? [])];
}
