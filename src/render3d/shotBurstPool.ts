import {
  AdditiveBlending,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  type Vector3,
} from 'three';
import type { Vec2 } from '../sim/types';
import {
  burstProfile,
  type InternalBurstKind,
  type ShotBurstFamily,
  type ShotBurstKind,
} from './shotBurstProfiles';
import {
  baseShotSlot,
  safeShotDelta,
  SHOT_PRIORITY,
  ShotPoolCore,
  type ShotPoolSnapshot,
  type ShotSlot,
} from './shotPoolCore';

export type { ShotBurstFamily, ShotBurstKind } from './shotBurstProfiles';

interface BurstSlot extends ShotSlot {
  x: number;
  y: number;
  z: number;
  scale: number;
  size: number;
  grow: number;
  rise: number;
  spread: number;
  core: number;
  fall: number;
  /** Seconds the burst waits unseen, so a travelling read can arrive first. */
  delay: number;
}

const INSTANCE = new Object3D();
const CORE_BRIGHTNESS = 0.65;

/** One compact particle batch covers impacts and the two explosion scales. */
export class ShotBurstPool {
  readonly mesh: InstancedMesh;
  private readonly core: ShotPoolCore<BurstSlot>;

  constructor(capacity: number, instancesPerSlot = 8) {
    const material = new MeshBasicMaterial({
      color: 0xffffff,
      // Enabling geometry colours would multiply these instance-only colours by black.
      vertexColors: false,
      transparent: true,
      opacity: 1,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.mesh = new InstancedMesh(
      new OctahedronGeometry(1, 0),
      material,
      capacity * instancesPerSlot,
    );
    this.mesh.name = 'shot-burst';
    this.core = new ShotPoolCore(this.mesh, capacity, instancesPerSlot, (index) => ({
      ...baseShotSlot(index * instancesPerSlot),
      x: 0,
      y: 0,
      z: 0,
      scale: 1,
      size: 1,
      grow: 1,
      rise: 0,
      spread: 0,
      core: 0,
      fall: 0,
      delay: 0,
    }));
  }

  spawn(
    at: Vec2,
    ground: number,
    kind: ShotBurstKind,
    colour: number,
    scale: number,
    lifeScale: number,
    detailScale: number,
    family: ShotBurstFamily = 'generic',
    delay = 0,
  ): void {
    this.spawnAt(
      at.x,
      ground + 14,
      at.y,
      kind,
      colour,
      scale,
      lifeScale,
      detailScale,
      family,
      delay,
    );
  }

  muzzle(
    at: Vector3,
    colour: number,
    scale: number,
    lifeScale: number,
    detailScale: number,
  ): void {
    this.spawnAt(at.x, at.y, at.z, 'muzzle', colour, scale, lifeScale, detailScale, 'generic', 0);
  }

  update(deltaSeconds: number): void {
    const delta = safeShotDelta(deltaSeconds);
    for (const slot of this.core.slots) {
      if (!slot.active) continue;
      if (slot.delay > 0) {
        slot.delay -= delta;
        if (slot.delay > 0) continue;
        slot.delay = 0;
        this.writeMatrices(slot, 0);
        for (let index = 0; index < slot.count; index += 1) {
          this.core.setColour(slot, index, index === 0 && slot.core > 0 ? CORE_BRIGHTNESS : 1);
        }
        continue;
      }
      slot.remaining -= delta;
      if (slot.remaining <= 0) {
        this.core.expire(slot);
        continue;
      }
      const spent = 1 - slot.remaining / slot.life;
      this.writeMatrices(slot, spent);
      for (let index = 0; index < slot.count; index += 1) {
        // The glow core is a flash, gone well before the sparks finish, and kept
        // under full brightness so additive blending leaves the weapon's colour in it.
        const fade = index === 0 && slot.core > 0
          ? CORE_BRIGHTNESS * Math.max(0, 1 - spent * 2.2)
          : 1 - spent;
        this.core.setColour(slot, index, fade);
      }
    }
    this.core.commit();
  }

  snapshot(): ShotPoolSnapshot {
    return this.core.snapshot();
  }

  clear(): void {
    this.core.clear();
  }

  private spawnAt(
    x: number,
    y: number,
    z: number,
    kind: InternalBurstKind,
    colour: number,
    scale: number,
    lifeScale: number,
    detailScale: number,
    family: ShotBurstFamily,
    delay: number,
  ): void {
    const profile = burstProfile(kind, family);
    const priority = kind === 'terminal' || kind === 'ammo' || kind === 'shell'
      ? SHOT_PRIORITY.terminal
      : kind === 'critical'
        ? SHOT_PRIORITY.critical
        : kind === 'muzzle'
          ? SHOT_PRIORITY.decoration
          : SHOT_PRIORITY.standard;
    const slot = this.core.acquire(priority);
    if (slot === null) return;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.scale = Math.max(0.1, scale);
    slot.size = profile.size;
    slot.grow = profile.grow;
    slot.rise = profile.rise;
    slot.spread = profile.spread;
    slot.core = profile.core;
    slot.fall = profile.fall;
    slot.delay = Math.max(0, delay);
    const sparks = Math.max(1, Math.ceil(profile.particles * detailScale));
    this.core.configure(
      slot,
      profile.life * lifeScale,
      sparks + (profile.core > 0 ? 1 : 0),
      colour,
      profile.opacity,
    );
    if (slot.delay > 0) {
      this.core.commit();
      return;
    }
    this.writeMatrices(slot, 0);
    for (let index = 0; index < slot.count; index += 1) {
      this.core.setColour(slot, index, index === 0 && profile.core > 0 ? CORE_BRIGHTNESS : 1);
    }
    this.core.commit();
  }

  private writeMatrices(slot: BurstSlot, spent: number): void {
    const hasCore = slot.core > 0;
    for (let index = 0; index < slot.count; index += 1) {
      if (hasCore && index === 0) {
        INSTANCE.position.set(slot.x, slot.y, slot.z);
        INSTANCE.quaternion.identity();
        INSTANCE.scale.setScalar(slot.scale * slot.size * slot.core * (1 + spent * 0.8));
        INSTANCE.updateMatrix();
        this.core.setMatrix(slot, index, INSTANCE.matrix);
        continue;
      }
      const spark = hasCore ? index - 1 : index;
      const sparks = hasCore ? slot.count - 1 : slot.count;
      const angle = spark * 2.399963;
      const reach = slot.spread * slot.scale * (0.35 + spark / sparks * 0.65) * spent;
      const drop = slot.fall * slot.life * spent * spent;
      INSTANCE.position.set(
        slot.x + Math.cos(angle) * reach,
        slot.y + slot.rise * slot.life * spent - drop + Math.sin(spark * 1.7) * reach * 0.28,
        slot.z + Math.sin(angle) * reach,
      );
      INSTANCE.quaternion.identity();
      const size = slot.scale * slot.size * (1 + spent * slot.grow) * (1 - spark * 0.035);
      INSTANCE.scale.setScalar(size);
      INSTANCE.updateMatrix();
      this.core.setMatrix(slot, index, INSTANCE.matrix);
    }
  }
}
