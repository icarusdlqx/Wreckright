import { InstancedMesh, Vector3 } from 'three';
import {
  emptyProjectileTrack,
  placeProjectileInstance,
  projectileBatch,
  projectilePoint,
  writeProjectileTrack,
  type ProjectileTrack,
  type ShotStyle,
} from './projectilePresentation';
import {
  baseShotSlot,
  safeShotDelta,
  SHOT_PRIORITY,
  ShotPoolCore,
  type ShotPoolSnapshot,
  type ShotSlot,
} from './shotPoolCore';
import { shotPoolMaterial } from './shotPoolMaterial';

export { InstantShotPool, type InstantShotStyle } from './instantShotPool';

interface PathSlot extends ShotSlot {
  track: ProjectileTrack;
  width: number;
  shooterId: number;
  targetId: number;
  weaponId: string;
  targetOffsetX: number;
  targetOffsetY: number;
  targetOffsetZ: number;
  presentationDelay: number;
  resolved: boolean;
  /** Known at launch to fall short, so it flies at its own dirt instead of the hull. */
  missed: boolean;
  trail: boolean;
  trailClock: number;
}

export interface ProjectileEngagement {
  readonly shooterId: number;
  readonly targetId: number;
  readonly weaponId: string;
}
export type ProjectileEndpointResolver = (targetId: number, out: Vector3) => boolean;

export interface ProjectileSpawn {
  readonly arc: number;
  readonly velocity: number;
  readonly width: number;
  readonly colour: number;
  readonly engagement?: ProjectileEngagement | null;
  readonly targetOffsetX?: number;
  readonly targetOffsetY?: number;
  readonly targetOffsetZ?: number;
  readonly flightSeconds?: number | null;
  readonly visibleFlightSeconds?: number | null;
  readonly missed?: boolean;
  readonly trail?: boolean;
}

export interface TrailEmitter {
  readonly interval: number;
  emit(x: number, y: number, z: number, width: number): void;
}

const LIVE_ENDPOINT = new Vector3();
const TRAIL_POINT = new Vector3();
const MIN_PROJECTILE_LIFE = 0.05;

function pathSlot(start: number): PathSlot {
  return {
    ...baseShotSlot(start),
    track: emptyProjectileTrack(),
    width: 1,
    shooterId: -1,
    targetId: -1,
    weaponId: '',
    targetOffsetX: 0,
    targetOffsetY: 0,
    targetOffsetZ: 0,
    presentationDelay: 0,
    resolved: true,
    missed: false,
    trail: false,
    trailClock: 0,
  };
}

export class ProjectileShotPool {
  readonly mesh: InstancedMesh;
  private readonly core: ShotPoolCore<PathSlot>;

  constructor(name: string, style: ShotStyle, capacity: number) {
    this.mesh = projectileBatch(style, shotPoolMaterial(), capacity);
    this.mesh.name = `shot-${name}`;
    this.core = new ShotPoolCore(this.mesh, capacity, 1, pathSlot);
  }

  spawn(from: Vector3, toX: number, toY: number, toZ: number, shot: ProjectileSpawn): void {
    const slot = this.core.acquire(SHOT_PRIORITY.standard);
    if (slot === null) return;
    writeProjectileTrack(slot.track, from, toX, toY, toZ, shot.arc, shot.velocity);
    const flightSeconds = shot.flightSeconds ?? null;
    const visibleFlightSeconds = shot.visibleFlightSeconds ?? null;
    const totalFlight = flightSeconds === null
      ? slot.track.duration
      : Math.max(0.001, flightSeconds);
    const visibleFlight = visibleFlightSeconds === null
      ? totalFlight
      : Math.min(totalFlight, Math.max(0.001, visibleFlightSeconds));
    slot.track.duration = visibleFlight;
    slot.width = shot.width;
    slot.shooterId = shot.engagement?.shooterId ?? -1;
    slot.targetId = shot.engagement?.targetId ?? -1;
    slot.weaponId = shot.engagement?.weaponId ?? '';
    slot.targetOffsetX = shot.targetOffsetX ?? 0;
    slot.targetOffsetY = shot.targetOffsetY ?? 0;
    slot.targetOffsetZ = shot.targetOffsetZ ?? 0;
    slot.presentationDelay = totalFlight - visibleFlight;
    slot.resolved = false;
    slot.missed = shot.missed === true;
    slot.trail = shot.trail === true;
    slot.trailClock = 0;
    this.core.configure(slot, Math.max(MIN_PROJECTILE_LIFE, totalFlight), 1, shot.colour, 1);
    if (slot.presentationDelay <= 0) {
      placeProjectileInstance(this.mesh, slot.start, slot.track, 0, slot.width);
      this.core.setColour(slot, 0, 1);
    }
    this.core.commit();
  }

  update(
    deltaSeconds: number,
    endpointOf?: ProjectileEndpointResolver,
    trail?: TrailEmitter,
  ): void {
    const delta = safeShotDelta(deltaSeconds);
    for (const slot of this.core.slots) {
      if (!slot.active) continue;
      if (
        !slot.resolved && slot.targetId >= 0 && endpointOf !== undefined &&
        endpointOf(slot.targetId, LIVE_ENDPOINT)
      ) {
        slot.track.toX = LIVE_ENDPOINT.x + slot.targetOffsetX;
        slot.track.toY = LIVE_ENDPOINT.y + slot.targetOffsetY;
        slot.track.toZ = LIVE_ENDPOINT.z + slot.targetOffsetZ;
      }
      slot.remaining -= delta;
      if (slot.remaining <= 0) {
        this.core.expire(slot);
        continue;
      }
      const elapsed = slot.life - slot.remaining;
      if (!slot.resolved && elapsed < slot.presentationDelay) {
        this.core.setColour(slot, 0, 0);
        continue;
      }
      if (!slot.resolved) {
        const progress = (elapsed - slot.presentationDelay) / slot.track.duration;
        placeProjectileInstance(this.mesh, slot.start, slot.track, progress, slot.width);
        if (trail !== undefined && slot.trail) {
          slot.trailClock += delta;
          if (slot.trailClock >= trail.interval) {
            slot.trailClock = 0;
            projectilePoint(slot.track, progress, TRAIL_POINT);
            trail.emit(TRAIL_POINT.x, TRAIL_POINT.y, TRAIL_POINT.z, slot.width);
          }
        }
      }
      const fadeLife = slot.presentationDelay > 0 ? slot.track.duration : slot.life;
      this.core.setColour(slot, 0, Math.min(1, slot.remaining / fadeLife));
    }
    this.core.commit();
  }

  snapshot(): ShotPoolSnapshot { return this.core.snapshot(); }
  clear(): void { this.core.clear(); }

  /**
   * A hit lands its oldest hull-bound round on the struck plate. A miss retires
   * its oldest dirt-bound round where it was already heading; only a round with
   * no known outcome is dragged to the event's point.
   */
  resolve(engagement: ProjectileEngagement, endpoint: Vector3, missed = false): boolean {
    let found: PathSlot | null = null;
    let fallback: PathSlot | null = null;
    for (const slot of this.core.slots) {
      if (
        !slot.active || slot.resolved ||
        slot.shooterId !== engagement.shooterId ||
        slot.targetId !== engagement.targetId ||
        slot.weaponId !== engagement.weaponId
      ) continue;
      if (slot.missed === missed) {
        if (found === null || slot.generation < found.generation) found = slot;
      } else if (!slot.missed && (fallback === null || slot.generation < fallback.generation)) {
        fallback = slot;
      }
    }
    if (found !== null) {
      this.finish(found, found.missed ? undefined : endpoint, false);
    } else if (fallback !== null) {
      this.finish(fallback, endpoint, false);
    } else {
      return false;
    }
    this.core.commit();
    return true;
  }

  /** Lands every unresolved round for a target, or every round when targetId is null. */
  resolveOutstanding(targetId: number | null, endpoint?: Vector3): number {
    let resolved = 0;
    for (const slot of this.core.slots) {
      if (!slot.active || slot.resolved) continue;
      if (targetId !== null && slot.targetId !== targetId) continue;
      this.finish(slot, slot.missed ? undefined : endpoint, endpoint !== undefined);
      resolved += 1;
    }
    if (resolved > 0) this.core.commit();
    return resolved;
  }

  private finish(slot: PathSlot, endpoint: Vector3 | undefined, keepSpread: boolean): void {
    if (endpoint !== undefined) {
      slot.track.toX = endpoint.x + (keepSpread ? slot.targetOffsetX : 0);
      slot.track.toY = endpoint.y;
      slot.track.toZ = endpoint.z + (keepSpread ? slot.targetOffsetZ : 0);
    }
    slot.resolved = true;
    slot.presentationDelay = 0;
    slot.life = MIN_PROJECTILE_LIFE;
    slot.remaining = MIN_PROJECTILE_LIFE;
    placeProjectileInstance(this.mesh, slot.start, slot.track, 1, slot.width);
    this.core.setColour(slot, 0, 1);
  }
}
