import { canPresentEntity } from '../render3d/visibilityPresentation';
import type { SimEvent } from '../sim/events';
import { isOperational, type MechEntity, type World } from '../sim/types';

export {
  SCORE_CLOSE_DELAY_MS,
  SCORE_FILTER_COUNT,
  SCORE_GAIN_COUNT,
  SCORE_NODE_COUNT,
  SCORE_RETARGET_INTERVAL_SECONDS,
  SCORE_SOURCE_COUNT,
  fullLayerLevel,
  startBattleScore,
} from './audioScoreGraph';
export type { ScoreHandle, ScoreState } from './audioScoreGraph';

const INTENSITY_HALF_LIFE_SECONDS = 4.5;
const MOVEMENT_FLOOR = 0.12;
const MOVEMENT_RANGE = 0.12;
const SENSOR_CONTACT_FLOOR = 0.3;
const OPTICAL_CONTACT_FLOOR = 0.38;
const NEW_CONTACT_IMPULSE = 0.12;
const NEW_CONTACT_IMPULSE_LIMIT = 0.24;

/**
 * Presentation-only pressure. It follows simulation time without feeding any
 * information back into the deterministic world.
 */
export class BattleIntensity {
  private lastTick: number | null = null;
  private readonly knownContacts = new Set<number>();
  private contactsSeeded = false;
  private current = 0;

  get value(): number {
    return this.current;
  }

  reset(): void {
    this.lastTick = null;
    this.knownContacts.clear();
    this.contactsSeeded = false;
    this.current = 0;
  }

  advance(world: World, events: readonly SimEvent[]): number {
    if (this.lastTick !== null && world.tick >= this.lastTick) {
      const elapsed = (world.tick - this.lastTick) * world.dt;
      if (Number.isFinite(elapsed) && elapsed > 0) {
        this.current *= 2 ** (-elapsed / INTENSITY_HALF_LIFE_SECONDS);
      }
    } else if (this.lastTick !== null) {
      this.reset();
    }
    this.lastTick = world.tick;

    const contacts = contactState(world);
    const newContacts = this.seedContacts(contacts.ids);
    const movement = movementFloor(world);
    const contactFloor = contacts.optical
      ? OPTICAL_CONTACT_FLOOR
      : contacts.sensor
        ? SENSOR_CONTACT_FLOOR
        : 0;
    this.current = Math.max(this.current, movement, contactFloor);

    if (newContacts > 0) {
      this.addImpulse(Math.min(NEW_CONTACT_IMPULSE_LIMIT, newContacts * NEW_CONTACT_IMPULSE));
    }
    for (const event of events) this.addImpulse(observableEventWeight(world, event));

    if (events.some((event) => event.type === 'battle_ended' || event.type === 'mission_ended')) {
      this.current = 0;
    }
    this.current = clamp01(this.current);
    return this.current;
  }

  private seedContacts(ids: readonly number[]): number {
    if (!this.contactsSeeded) {
      for (const id of ids) this.knownContacts.add(id);
      this.contactsSeeded = true;
      return 0;
    }

    let fresh = 0;
    for (const id of ids) {
      if (this.knownContacts.has(id)) continue;
      this.knownContacts.add(id);
      fresh += 1;
    }
    return fresh;
  }

  private addImpulse(weight: number): void {
    if (weight <= 0) return;
    const bounded = clamp01(weight);
    this.current += (1 - this.current) * bounded;
  }
}

function contactState(world: World): { ids: number[]; optical: boolean; sensor: boolean } {
  const playerTeam = world.playerTeam ?? world.vision?.team ?? null;
  const hostile = (id: number): boolean => {
    const entity = world.entities.find((candidate) => candidate.id === id);
    return entity !== undefined
      && isOperational(entity)
      && (playerTeam === null || entity.team !== playerTeam);
  };

  if (world.vision === null) {
    const ids = world.entities
      .filter((entity) => isOperational(entity) && (playerTeam === null || entity.team !== playerTeam))
      .map((entity) => entity.id);
    return { ids, optical: ids.length > 0, sensor: ids.length > 0 };
  }

  const optical = [...world.vision.visible].filter(hostile);
  const detected = [...world.vision.detected].filter(hostile);
  return {
    ids: [...new Set([...optical, ...detected])],
    optical: optical.length > 0,
    sensor: detected.length > 0,
  };
}

function movementFloor(world: World): number {
  const entities = world.entities.filter(
    (entity) => isOperational(entity) && motionIsPresentable(world, entity),
  );
  if (entities.length === 0) return 0;
  const moving = entities.filter((entity) => entity.motion !== 'stationary').length;
  return moving === 0 ? 0 : MOVEMENT_FLOOR + MOVEMENT_RANGE * (moving / entities.length);
}

function motionIsPresentable(world: World, entity: MechEntity): boolean {
  const playerTeam = world.playerTeam ?? world.vision?.team ?? null;
  if (playerTeam === null || entity.team === playerTeam || world.vision === null) return true;
  return world.vision.visible.has(entity.id);
}

function observableEventWeight(world: World, event: SimEvent): number {
  switch (event.type) {
    case 'weapon_fired':
      return canPresentEntity(world, event.shooterId) ? 0.08 : 0;
    case 'projectile_hit':
      return canPresentEntity(world, event.targetId) ? 0.015 : 0;
    case 'projectile_miss':
      return canPresentEntity(world, event.targetId) ? 0.006 : 0;
    case 'location_destroyed':
      return entityEventWeight(world, event.entityId, 0.18, 0.4);
    case 'critical_hit':
      return entityEventWeight(world, event.entityId, 0.22, 0.55);
    case 'ammo_explosion':
      return canPresentEntity(world, event.entityId) ? 0.45 : 0;
    case 'staggered':
      return canPresentEntity(world, event.entityId) ? 0.08 : 0;
    case 'knocked_down':
      return entityEventWeight(world, event.entityId, 0.24, 0.45);
    case 'pilot_injured':
      return entityEventWeight(world, event.entityId, 0.18, 0.28);
    case 'shutdown':
      return entityEventWeight(world, event.entityId, 0.2, 0.4);
    case 'pilot_ejected':
      return entityEventWeight(world, event.entityId, 0.3, 0.55);
    case 'mech_destroyed':
      return entityEventWeight(world, event.entityId, 0.35, 0.6);
    case 'jump_started':
      return canPresentEntity(world, event.entityId) ? 0.08 : 0;
    case 'jump_landed':
      return canPresentEntity(world, event.entityId) ? 0.05 : 0;
    case 'alpha_strike':
      return canPresentEntity(world, event.entityId) ? 0.25 : 0;
    case 'support_called':
      return event.team === (world.playerTeam ?? world.vision?.team) ? 0.08 : 0;
    case 'support_resolved':
      return event.team === (world.playerTeam ?? world.vision?.team) ? 0.14 : 0;
    case 'ground_impact':
      return pointIsPresentable(world, event.x, event.y) ? 0.2 : 0;
    case 'zone_captured':
    case 'objective_settled':
      return 0.08;
    default:
      return 0;
  }
}

function entityEventWeight(
  world: World,
  entityId: number,
  hostileWeight: number,
  friendlyWeight: number,
): number {
  if (!canPresentEntity(world, entityId)) return 0;
  const entity = world.entities.find((candidate) => candidate.id === entityId);
  const playerTeam = world.playerTeam ?? world.vision?.team ?? null;
  return entity !== undefined && playerTeam !== null && entity.team === playerTeam
    ? friendlyWeight
    : hostileWeight;
}

function pointIsPresentable(world: World, x: number, y: number): boolean {
  const vision = world.vision;
  if (vision === null) return true;
  const tile = world.terrain.toTile({ x, y });
  if (!world.terrain.inBounds(tile.column, tile.row)) return false;
  return vision.tiles[tile.row * world.terrain.width + tile.column] === 1;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
