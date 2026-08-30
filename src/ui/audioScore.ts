import { canPresentEntity } from '../render3d/visibilityPresentation';
import type { SimEvent } from '../sim/events';
import { isOperational, type MechEntity, type World } from '../sim/types';
import type { AmbientBus } from './audioGraph';

const INTENSITY_HALF_LIFE_SECONDS = 4.5;
const MOVEMENT_FLOOR = 0.12;
const MOVEMENT_RANGE = 0.12;
const SENSOR_CONTACT_FLOOR = 0.3;
const OPTICAL_CONTACT_FLOOR = 0.38;
const NEW_CONTACT_IMPULSE = 0.12;
const NEW_CONTACT_IMPULSE_LIMIT = 0.24;

/** Four standing sources, independent of the bounded one-shot voice pool. */
export const SCORE_SOURCE_COUNT = 4;
/** Gain automation never grows faster than eight retargets per real second. */
export const SCORE_RETARGET_INTERVAL_SECONDS = 0.125;
/** Leaves five fade constants before the shared context releases its graph. */
export const SCORE_CLOSE_DELAY_MS = 120;

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

export interface ScoreHandle {
  setIntensity(value: number, playbackSpeed?: number): void;
  stop(): void;
}

type ScoreBus = Pick<AmbientBus, 'context' | 'master'>;

const SCORE_LEVEL = 0.052;
const AUTOMATION_EPSILON = 0.004;
const ATTACK_SECONDS = 0.6;
const RELEASE_SECONDS = 1.6;
const STOP_TIME_CONSTANT_SECONDS = 0.02;
const SOURCE_STOP_SECONDS = 0.1;

/** Builds the battle's two continuous score layers under the shared master. */
export function startBattleScore(bus: ScoreBus): ScoreHandle {
  const now = bus.context.currentTime;
  const scoreLevel = bus.context.createGain();
  scoreLevel.gain.value = 0;
  scoreLevel.connect(bus.master);
  scoreLevel.gain.setTargetAtTime(SCORE_LEVEL, now, 1.2);

  const droneLayer = bus.context.createGain();
  droneLayer.gain.value = 0;
  droneLayer.connect(scoreLevel);
  droneLayer.gain.setTargetAtTime(droneLevel(0), now, 1.2);
  const droneFilter = bus.context.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 190;
  droneFilter.Q.value = 0.7;
  droneFilter.connect(droneLayer);

  const root = bus.context.createOscillator();
  root.type = 'triangle';
  root.frequency.value = 43.65;
  const rootLevel = bus.context.createGain();
  rootLevel.gain.value = 0.56;
  root.connect(rootLevel).connect(droneFilter);

  const fifth = bus.context.createOscillator();
  fifth.type = 'sine';
  fifth.frequency.value = 65.41;
  const fifthLevel = bus.context.createGain();
  fifthLevel.gain.value = 0.22;
  fifth.connect(fifthLevel).connect(droneFilter);

  const pulseLayer = bus.context.createGain();
  pulseLayer.gain.value = 0;
  pulseLayer.connect(scoreLevel);
  pulseLayer.gain.setTargetAtTime(pulseLevelFor(0), now, 1.2);
  const pulseFilter = bus.context.createBiquadFilter();
  pulseFilter.type = 'lowpass';
  pulseFilter.frequency.value = 520;
  pulseFilter.Q.value = 0.9;
  pulseFilter.connect(pulseLayer);

  const pulseGate = bus.context.createGain();
  pulseGate.gain.value = 0.5;
  pulseGate.connect(pulseFilter);
  const pulse = bus.context.createOscillator();
  pulse.type = 'triangle';
  pulse.frequency.value = 87.31;
  const pulseLevel = bus.context.createGain();
  pulseLevel.gain.value = 0.34;
  pulse.connect(pulseLevel).connect(pulseGate);

  const pulseLfo = bus.context.createOscillator();
  pulseLfo.type = 'sine';
  pulseLfo.frequency.value = pulseRate(0);
  const pulseDepth = bus.context.createGain();
  pulseDepth.gain.value = 0.44;
  pulseLfo.connect(pulseDepth);
  pulseDepth.connect(pulseGate.gain);

  const sources: OscillatorNode[] = [root, fifth, pulse, pulseLfo];
  for (const source of sources) source.start(now);

  let stopped = false;
  let lastIntensity = 0;
  let lastDrone = droneLevel(0);
  let lastPulse = pulseLevelFor(0);
  let lastRate = pulseRate(0);
  let lastRetargetAt = Number.NEGATIVE_INFINITY;

  return {
    setIntensity: (rawValue: number, playbackSpeed = 1): void => {
      if (stopped) return;
      const value = clamp01(Number.isFinite(rawValue) ? rawValue : 0);
      const nextDrone = droneLevel(value);
      const nextPulse = pulseLevelFor(value);
      const nextRate = pulseRate(value);
      if (
        Math.abs(nextDrone - lastDrone) < AUTOMATION_EPSILON
        && Math.abs(nextPulse - lastPulse) < AUTOMATION_EPSILON
        && Math.abs(nextRate - lastRate) < AUTOMATION_EPSILON
      ) return;

      const at = bus.context.currentTime;
      const elapsed = at - lastRetargetAt;
      if (elapsed >= 0 && elapsed < SCORE_RETARGET_INTERVAL_SECONDS) return;
      const speed = sanitiseSpeed(playbackSpeed);
      const seconds = (value >= lastIntensity ? ATTACK_SECONDS : RELEASE_SECONDS) / speed;
      retarget(droneLayer.gain, nextDrone, at, seconds);
      retarget(pulseLayer.gain, nextPulse, at, seconds);
      retarget(pulseLfo.frequency, nextRate, at, seconds);
      lastIntensity = value;
      lastDrone = nextDrone;
      lastPulse = nextPulse;
      lastRate = nextRate;
      lastRetargetAt = at;
    },
    stop: (): void => {
      if (stopped) return;
      stopped = true;
      const at = bus.context.currentTime;
      retarget(scoreLevel.gain, 0, at, STOP_TIME_CONSTANT_SECONDS);
      for (const source of sources) {
        try {
          source.stop(at + SOURCE_STOP_SECONDS);
        } catch {
          // Closing the context has already ended the same finite lifetime.
        }
      }
    },
  };
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

function droneLevel(intensity: number): number {
  return 0.58 + intensity * 0.22;
}

function pulseLevelFor(intensity: number): number {
  const mix = smoothstep(0.14, 0.52, intensity);
  return mix * (0.32 + intensity * 0.46);
}

function pulseRate(intensity: number): number {
  return 0.72 + intensity * 1.45;
}

function retarget(param: AudioParam, value: number, at: number, seconds: number): void {
  param.cancelScheduledValues(at);
  param.setTargetAtTime(value, at, Math.max(0.01, seconds));
}

function sanitiseSpeed(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.min(4, Math.max(0.25, value)) : 1;
}

function smoothstep(from: number, to: number, value: number): number {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
