import {
  CylinderGeometry,
  InstancedMesh,
  Object3D,
  SphereGeometry,
  Vector3,
} from 'three';
import { emptyProjectileTrack, writeProjectileTrack, type ProjectileTrack } from './projectilePresentation';
import {
  baseShotSlot,
  safeShotDelta,
  SHOT_PRIORITY,
  ShotPoolCore,
  type ShotPoolSnapshot,
  type ShotSlot,
} from './shotPoolCore';
import { shotPoolMaterial } from './shotPoolMaterial';

interface InstantSlot extends ShotSlot {
  track: ProjectileTrack;
  width: number;
}

export type InstantShotStyle = 'beam' | 'pulse' | 'bolt' | 'flame';

const UP = new Vector3(0, 1, 0);
const FROM = new Vector3();
const TO = new Vector3();
const DIRECTION = new Vector3();
const INSTANCE = new Object3D();

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
  private readonly core: ShotPoolCore<InstantSlot>;

  constructor(
    readonly style: InstantShotStyle,
    capacity: number,
    instancesPerSlot: number,
  ) {
    const geometry = style === 'beam' || style === 'pulse'
      ? new CylinderGeometry(1, 1, 1, 6)
      : new SphereGeometry(1, 7, 5);
    this.mesh = new InstancedMesh(geometry, shotPoolMaterial(), capacity * instancesPerSlot);
    this.mesh.name = `shot-${style}`;
    this.core = new ShotPoolCore(this.mesh, capacity, instancesPerSlot, (index) => ({
      ...baseShotSlot(index * instancesPerSlot),
      track: emptyProjectileTrack(),
      width: 1,
    }));
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

  private writeMatrices(slot: InstantSlot): void {
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
