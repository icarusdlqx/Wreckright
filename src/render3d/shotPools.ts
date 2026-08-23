import {
  AdditiveBlending,
  CylinderGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
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

export type InstantShotStyle = 'beam' | 'pulse' | 'bolt' | 'flame';

const UP = new Vector3(0, 1, 0);
const FROM = new Vector3();
const TO = new Vector3();
const DIRECTION = new Vector3();
const INSTANCE = new Object3D();
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

function pathPoint(track: ProjectileTrack, progress: number): void {
  INSTANCE.position.set(
    track.fromX + (track.toX - track.fromX) * progress,
    track.fromY + (track.toY - track.fromY) * progress,
    track.fromZ + (track.toZ - track.fromZ) * progress,
  );
}

/** Instant reads share one batch per authored family. */
export class InstantShotPool {
  readonly mesh: InstancedMesh;
  private readonly core: ShotPoolCore<PathSlot>;

  constructor(
    readonly style: InstantShotStyle,
    capacity: number,
    instancesPerSlot: number,
  ) {
    const geometry = style === 'beam' || style === 'pulse'
      ? new CylinderGeometry(1, 1, 1, 6)
      : new SphereGeometry(1, 7, 5);
    this.mesh = new InstancedMesh(geometry, poolMaterial(), capacity * instancesPerSlot);
    this.mesh.name = `shot-${style}`;
    this.core = new ShotPoolCore(this.mesh, capacity, instancesPerSlot, (index) => (
      pathSlot(index * instancesPerSlot)
    ));
  }

  spawn(
    from: Vector3,
    toX: number,
    toY: number,
    toZ: number,
    colour: number,
    width: number,
    life: number,
    detailScale: number,
  ): void {
    const slot = this.core.acquire(SHOT_PRIORITY.standard);
    if (slot === null) return;
    writeProjectileTrack(slot.track, from, toX, toY, toZ, 0, 1);
    slot.width = width;
    const count = this.style === 'beam'
      ? 1
      : Math.max(1, Math.ceil(this.core.instancesPerSlot * detailScale));
    const opacity = this.style === 'flame' ? 0.78 : this.style === 'bolt' ? 0.95 : 0.92;
    this.core.configure(slot, life, count, colour, opacity);
    this.writeMatrices(slot);
    for (let index = 0; index < slot.count; index += 1) this.core.setColour(slot, index, 1);
    this.core.commit();
  }

  update(deltaSeconds: number): void {
    const delta = safeShotDelta(deltaSeconds);
    for (const slot of this.core.slots) {
      if (!slot.active) continue;
      slot.remaining -= delta;
      if (slot.remaining <= 0) {
        this.core.expire(slot);
        continue;
      }
      const fade = slot.remaining / slot.life;
      for (let index = 0; index < slot.count; index += 1) this.core.setColour(slot, index, fade);
    }
    this.core.commit();
  }

  snapshot(): ShotPoolSnapshot {
    return this.core.snapshot();
  }

  clear(): void {
    this.core.clear();
  }

  private writeMatrices(slot: PathSlot): void {
    if (this.style === 'beam') {
      FROM.set(slot.track.fromX, slot.track.fromY, slot.track.fromZ);
      TO.set(slot.track.toX, slot.track.toY, slot.track.toZ);
      DIRECTION.subVectors(TO, FROM);
      const length = DIRECTION.length();
      INSTANCE.position.addVectors(FROM, TO).multiplyScalar(0.5);
      INSTANCE.quaternion.setFromUnitVectors(UP, DIRECTION.multiplyScalar(1 / Math.max(0.001, length)));
      INSTANCE.scale.set(slot.width * 0.32, length, slot.width * 0.32);
      INSTANCE.updateMatrix();
      this.core.setMatrix(slot, 0, INSTANCE.matrix);
      return;
    }

    const distance = Math.hypot(
      slot.track.toX - slot.track.fromX,
      slot.track.toY - slot.track.fromY,
      slot.track.toZ - slot.track.fromZ,
    );
    for (let index = 0; index < slot.count; index += 1) {
      const progress = this.style === 'pulse'
        ? (index + 0.5) / slot.count
        : (index + 1) / slot.count;
      pathPoint(slot.track, progress);
      if (this.style === 'pulse') {
        DIRECTION.set(
          slot.track.toX - slot.track.fromX,
          slot.track.toY - slot.track.fromY,
          slot.track.toZ - slot.track.fromZ,
        ).normalize();
        INSTANCE.quaternion.setFromUnitVectors(UP, DIRECTION);
        INSTANCE.scale.set(slot.width * 0.38, distance * 0.1, slot.width * 0.38);
      } else if (this.style === 'bolt') {
        const envelope = Math.sin(progress * Math.PI);
        INSTANCE.position.y += Math.sin(index * 2.3) * slot.width * 0.7 * envelope;
        INSTANCE.position.z += Math.cos(index * 1.7) * slot.width * 0.45 * envelope;
        INSTANCE.quaternion.identity();
        INSTANCE.scale.setScalar(slot.width * 0.44);
      } else {
        INSTANCE.position.y += Math.sin(index * 1.9) * slot.width * 0.22 * progress;
        INSTANCE.position.z += Math.cos(index * 1.4) * slot.width * 0.18 * progress;
        INSTANCE.quaternion.identity();
        INSTANCE.scale.set(
          slot.width * 0.24 * (1 + progress * 1.5),
          slot.width * 0.24 * (0.7 + progress),
          slot.width * 0.24 * (0.7 + progress),
        );
      }
      INSTANCE.updateMatrix();
      this.core.setMatrix(slot, index, INSTANCE.matrix);
    }
  }
}

export class ProjectileShotPool {
  readonly mesh: InstancedMesh;
  private readonly core: ShotPoolCore<PathSlot>;

  constructor(name: string, style: ShotStyle, capacity: number) {
    this.mesh = projectileBatch(style, poolMaterial(), capacity);
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
      const fadeLife = slot.presentationDelay > 0 ? slot.track.duration : slot.life;
      this.core.setColour(slot, 0, Math.min(1, slot.remaining / fadeLife));
    }
    this.core.commit();
  }

  snapshot(): ShotPoolSnapshot { return this.core.snapshot(); }
  clear(): void { this.core.clear(); }
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
    slot.presentationDelay = 0;
    slot.life = MIN_PROJECTILE_LIFE;
    slot.remaining = MIN_PROJECTILE_LIFE;
    placeProjectileInstance(this.mesh, slot.start, slot.track, 1, slot.width);
    this.core.setColour(slot, 0, 1);
  }
}
