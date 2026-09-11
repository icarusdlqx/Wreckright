import {
  AdditiveBlending,
  InstancedMesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import {
  emptyProjectileTrack,
  placeProjectileInstance,
  projectileBatch,
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
import { ProjectileWake } from './projectileWake';

interface PathSlot extends ShotSlot {
  track: ProjectileTrack;
  width: number;
  shooterId: number;
  targetId: number;
  weaponId: string;
  targetOffsetX: number;
  targetOffsetZ: number;
  presentationDelay: number;
  resolved: boolean;
}

export interface ProjectileEngagement {
  readonly shooterId: number;
  readonly targetId: number;
  readonly weaponId: string;
}
export type ProjectileEndpointResolver = (targetId: number, out: Vector3) => boolean;

export { InstantShotPool, type InstantShotStyle } from './instantShotPool';

const LIVE_ENDPOINT = new Vector3();
const MIN_PROJECTILE_LIFE = 0.05;

function poolMaterial(opacity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: 0xffffff,
    // Enabling geometry colours would multiply these instance-only colours by black.
    vertexColors: false,
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}

function pathSlot(start: number): PathSlot {
  return {
    ...baseShotSlot(start),
    track: emptyProjectileTrack(),
    width: 1,
    shooterId: -1,
    targetId: -1,
    weaponId: '',
    targetOffsetX: 0,
    targetOffsetZ: 0,
    presentationDelay: 0,
    resolved: true,
  };
}


export class ProjectileShotPool {
  readonly mesh: InstancedMesh;
  readonly wake: ProjectileWake;
  private readonly core: ShotPoolCore<PathSlot>;

  constructor(name: string, style: ShotStyle, capacity: number) {
    this.mesh = projectileBatch(style, poolMaterial(), capacity);
    this.wake = new ProjectileWake(style, capacity);
    this.mesh.name = `shot-${name}`;
    this.core = new ShotPoolCore(this.mesh, capacity, 1, pathSlot);
  }

  spawn(
    from: Vector3,
    toX: number,
    toY: number,
    toZ: number,
    arc: number,
    velocity: number,
    width: number,
    colour: number,
    engagement: ProjectileEngagement | null = null,
    targetOffsetX = 0,
    targetOffsetZ = 0,
    flightSeconds: number | null = null,
    visibleFlightSeconds: number | null = null,
  ): void {
    const slot = this.core.acquire(SHOT_PRIORITY.standard);
    if (slot === null) return;
    this.wake.hide(slot.start);
    writeProjectileTrack(slot.track, from, toX, toY, toZ, arc, velocity);
    const totalFlight = flightSeconds === null
      ? slot.track.duration
      : Math.max(0.001, flightSeconds);
    const visibleFlight = visibleFlightSeconds === null
      ? totalFlight
      : Math.min(totalFlight, Math.max(0.001, visibleFlightSeconds));
    slot.track.duration = visibleFlight;
    slot.width = width;
    slot.shooterId = engagement?.shooterId ?? -1;
    slot.targetId = engagement?.targetId ?? -1;
    slot.weaponId = engagement?.weaponId ?? '';
    slot.targetOffsetX = targetOffsetX;
    slot.targetOffsetZ = targetOffsetZ;
    slot.presentationDelay = totalFlight - visibleFlight;
    slot.resolved = false;
    this.core.configure(slot, Math.max(MIN_PROJECTILE_LIFE, totalFlight), 1, colour, 1);
    if (slot.presentationDelay <= 0) {
      placeProjectileInstance(this.mesh, slot.start, slot.track, 0, width);
      this.core.setColour(slot, 0, 1);
    }
    this.core.commit();
    this.wake.commit();
  }

  update(deltaSeconds: number, endpointOf?: ProjectileEndpointResolver): void {
    const delta = safeShotDelta(deltaSeconds);
    for (const slot of this.core.slots) {
      if (!slot.active) continue;
      if (
        !slot.resolved && slot.targetId >= 0 && endpointOf !== undefined &&
        endpointOf(slot.targetId, LIVE_ENDPOINT)
      ) {
        slot.track.toX = LIVE_ENDPOINT.x + slot.targetOffsetX;
        slot.track.toY = LIVE_ENDPOINT.y;
        slot.track.toZ = LIVE_ENDPOINT.z + slot.targetOffsetZ;
      }
      slot.remaining -= delta;
      if (slot.remaining <= 0) {
        this.wake.hide(slot.start);
        this.core.expire(slot);
        continue;
      }
      const elapsed = slot.life - slot.remaining;
      if (!slot.resolved && elapsed < slot.presentationDelay) {
        this.core.setColour(slot, 0, 0);
        continue;
      }
      if (!slot.resolved) {
        placeProjectileInstance(
          this.mesh,
          slot.start,
          slot.track,
          (elapsed - slot.presentationDelay) / slot.track.duration,
          slot.width,
        );
      }
      if (!slot.resolved) this.wake.write(slot.start, slot.track,
        Math.min(1, (elapsed - slot.presentationDelay) / slot.track.duration), slot.width, slot.colour, 1);
      const fadeLife = slot.presentationDelay > 0 ? slot.track.duration : slot.life;
      this.core.setColour(slot, 0, Math.min(1, slot.remaining / fadeLife));
    }
    this.core.commit();
    this.wake.commit();
  }

  snapshot(): ShotPoolSnapshot { return { ...this.core.snapshot(), physicalCapacity: this.mesh.instanceMatrix.count + this.wake.mesh.instanceMatrix.count }; }
  clear(): void { this.core.clear(); this.wake.clear(); }
  resolve(engagement: ProjectileEngagement, endpoint: Vector3): boolean {
    let found: PathSlot | null = null;
    for (const slot of this.core.slots) {
      if (
        !slot.active || slot.resolved ||
        slot.shooterId !== engagement.shooterId ||
        slot.targetId !== engagement.targetId ||
        slot.weaponId !== engagement.weaponId
      ) continue;
      if (found === null || slot.generation < found.generation) found = slot;
    }
    if (found === null) return false;
    this.finish(found, endpoint, false);
    this.core.commit();
    return true;
  }

  /** Lands every unresolved round for a target, or every round when targetId is null. */
  resolveOutstanding(targetId: number | null, endpoint?: Vector3): number {
    let resolved = 0;
    for (const slot of this.core.slots) {
      if (!slot.active || slot.resolved) continue;
      if (targetId !== null && slot.targetId !== targetId) continue;
      this.finish(slot, endpoint, endpoint !== undefined);
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
    this.wake.hide(slot.start); this.wake.commit();
    slot.presentationDelay = 0;
    slot.life = MIN_PROJECTILE_LIFE;
    slot.remaining = MIN_PROJECTILE_LIFE;
    placeProjectileInstance(this.mesh, slot.start, slot.track, 1, slot.width);
    this.core.setColour(slot, 0, 1);
  }
}
