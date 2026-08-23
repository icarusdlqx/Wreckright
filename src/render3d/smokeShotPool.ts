import {
  AdditiveBlending,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
} from 'three';
import type { Vec2 } from '../sim/types';
import {
  baseShotSlot,
  safeShotDelta,
  SHOT_PRIORITY,
  ShotPoolCore,
  type ShotPoolSnapshot,
  type ShotSlot,
} from './shotPoolCore';

interface SmokeSlot extends ShotSlot {
  x: number;
  y: number;
  z: number;
  scale: number;
  rise: number;
  grow: number;
}

const INSTANCE = new Object3D();

function smokeMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: false,
    transparent: true,
    opacity: 0.5,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}

export class SmokeShotPool {
  readonly mesh: InstancedMesh;
  private readonly core: ShotPoolCore<SmokeSlot>;

  constructor(capacity: number) {
    this.mesh = new InstancedMesh(new SphereGeometry(4.5, 7, 6), smokeMaterial(), capacity);
    this.mesh.name = 'shot-smoke';
    this.core = new ShotPoolCore(this.mesh, capacity, 1, (index) => ({
      ...baseShotSlot(index),
      x: 0,
      y: 0,
      z: 0,
      scale: 1,
      rise: 13,
      grow: 2.4,
    }));
  }

  spawn(at: Vec2, ground: number, lifeScale: number): void {
    const slot = this.core.acquire(SHOT_PRIORITY.decoration);
    if (slot === null) return;
    slot.x = at.x;
    slot.y = ground + 14;
    slot.z = at.y;
    slot.scale = 1;
    slot.rise = 13;
    slot.grow = 2.4;
    this.core.configure(slot, 2.6 * lifeScale, 1, 0x6a6f74, 1);
    this.writeMatrix(slot, 0);
    this.core.setColour(slot, 0, 1);
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
      const spent = 1 - slot.remaining / slot.life;
      this.writeMatrix(slot, spent);
      this.core.setColour(slot, 0, 1 - spent);
    }
    this.core.commit();
  }

  snapshot(): ShotPoolSnapshot {
    return this.core.snapshot();
  }

  clear(): void {
    this.core.clear();
  }

  private writeMatrix(slot: SmokeSlot, spent: number): void {
    const growth = 1 + spent * slot.grow;
    INSTANCE.position.set(slot.x, slot.y + spent * slot.life * slot.rise, slot.z);
    INSTANCE.quaternion.identity();
    INSTANCE.scale.setScalar(slot.scale * growth);
    INSTANCE.updateMatrix();
    this.core.setMatrix(slot, 0, INSTANCE.matrix);
  }
}
