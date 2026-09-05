import {
  AdditiveBlending,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  Vector3,
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
import { ImpactShapeBatches } from './impactShapeBatches';

export type ShotBurstKind = 'hit' | 'miss' | 'critical' | 'ammo' | 'terminal';
export type ImpactFamily = 'generic' | 'ballistic' | 'energy' | 'missile' | 'ripple';
type InternalBurstKind = ShotBurstKind | 'muzzle' | 'footfall';

interface BurstProfile {
  life: number;
  particles: number;
  size: number;
  grow: number;
  rise: number;
  spread: number;
  opacity: number;
}

interface BurstSlot extends ShotSlot {
  x: number;
  y: number;
  z: number;
  scale: number;
  size: number;
  grow: number;
  rise: number;
  spread: number;
  family: ImpactFamily;
  bearing: number;
  motion: number;
}

const PROFILES: Readonly<Record<InternalBurstKind, BurstProfile>> = Object.freeze({
  muzzle: { life: 0.15, particles: 1, size: 1, grow: 1.8, rise: 0, spread: 0, opacity: 0.85 },
  hit: { life: 0.3, particles: 3, size: 0.9, grow: 2.6, rise: 4, spread: 2.4, opacity: 0.9 },
  miss: { life: 0.4, particles: 3, size: 0.65, grow: 1.8, rise: 7, spread: 3.2, opacity: 0.7 },
  critical: { life: 0.62, particles: 6, size: 1.05, grow: 2.8, rise: 9, spread: 5.2, opacity: 1 },
  ammo: { life: 0.55, particles: 5, size: 0.8, grow: 2.5, rise: 8, spread: 5, opacity: 0.95 },
  terminal: { life: 1.1, particles: 8, size: 1.35, grow: 3.6, rise: 13, spread: 10, opacity: 1 },
  footfall: { life: .7, particles: 1, size: 1, grow: 1, rise: 0, spread: 0, opacity: .45 },
});

const INSTANCE = new Object3D();
const DIRECTION = new Vector3();
const UP = new Vector3(0, 1, 0);

/** Fixed shape batches share one admission budget, including terminal priority. */
export class ShotBurstPool {
  readonly mesh: InstancedMesh;
  readonly shapes: ImpactShapeBatches;
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
    this.shapes = new ImpactShapeBatches(capacity, instancesPerSlot);
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
      family: 'generic', bearing: 0, motion: 1,
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
    family: ImpactFamily = 'generic',
    bearing = 0,
    motion = 1,
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
      family, bearing, motion,
    );
  }

  muzzle(
    at: Vector3,
    colour: number,
    scale: number,
    lifeScale: number,
    detailScale: number,
  ): void {
    this.spawnAt(at.x, at.y, at.z, 'muzzle', colour, scale, lifeScale, detailScale);
  }

  ripple(at: Vec2, height: number, scale: number): void {
    this.spawnAt(at.x, height + .3, at.y, 'footfall', 0xa8d1c7, scale, 1, 1, 'ripple');
  }

  update(deltaSeconds: number): void {
    const delta = safeShotDelta(deltaSeconds);
    for (const slot of this.core.slots) {
      if (!slot.active) continue;
      slot.remaining -= delta;
      if (slot.remaining <= 0) {
        this.shapes.hide(slot.start, this.core.instancesPerSlot);
        this.core.expire(slot);
        continue;
      }
      const spent = 1 - slot.remaining / slot.life;
      this.writeMatrices(slot, spent);
      for (let index = 0; slot.family === 'generic' && index < slot.count; index += 1) {
        this.core.setColour(slot, index, 1 - spent);
      }
    }
    this.core.commit();
    this.shapes.commit();
  }

  snapshot(): ShotPoolSnapshot {
    return { ...this.core.snapshot(), physicalCapacity: this.mesh.count + this.shapes.flare.count + this.shapes.blast.count };
  }

  clear(): void {
    this.core.clear();
    this.shapes.hide(0, this.mesh.count);
    this.shapes.commit();
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
    family: ImpactFamily = 'generic',
    bearing = 0,
    motion = 1,
  ): void {
    const profile = PROFILES[kind];
    const priority = kind === 'terminal' || kind === 'ammo'
      ? SHOT_PRIORITY.terminal
      : kind === 'critical'
        ? SHOT_PRIORITY.critical
        : kind === 'muzzle' || kind === 'footfall'
          ? SHOT_PRIORITY.decoration
          : SHOT_PRIORITY.standard;
    const slot = this.core.acquire(priority);
    if (slot === null) return;
    this.shapes.hide(slot.start, this.core.instancesPerSlot);
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.scale = Math.max(0.1, scale);
    slot.size = profile.size;
    slot.grow = profile.grow;
    slot.rise = profile.rise;
    slot.spread = profile.spread;
    slot.family = kind === 'hit' || kind === 'miss' || kind === 'footfall' ? family : 'generic';
    slot.bearing = Number.isFinite(bearing) ? bearing : 0;
    slot.motion = Math.max(0, Math.min(1, motion));
    const particles = slot.family === 'ballistic' ? 6 : slot.family === 'energy' ? 3 : slot.family === 'missile' ? 5 : profile.particles;
    this.core.configure(
      slot,
      profile.life * lifeScale,
      Math.max(1, Math.ceil(particles * detailScale)),
      colour,
      profile.opacity,
    );
    this.writeMatrices(slot, 0);
    if (slot.family === 'generic') {
      for (let index = 0; index < slot.count; index += 1) this.core.setColour(slot, index, 1);
    }
    this.core.commit();
    this.shapes.commit();
  }

  private writeMatrices(slot: BurstSlot, spent: number): void {
    if (slot.family !== 'generic') {
      this.writeImpact(slot, spent);
      return;
    }
    for (let index = 0; index < slot.count; index += 1) {
      const angle = index * 2.399963;
      const reach = slot.spread * slot.scale * (0.35 + index / slot.count * 0.65) * spent;
      INSTANCE.position.set(
        slot.x + Math.cos(angle) * reach,
        slot.y + slot.rise * slot.life * spent + Math.sin(index * 1.7) * reach * 0.28,
        slot.z + Math.sin(angle) * reach,
      );
      INSTANCE.quaternion.identity();
      const size = slot.scale * slot.size * (1 + spent * slot.grow) * (1 - index * 0.035);
      INSTANCE.scale.setScalar(size);
      INSTANCE.updateMatrix();
      this.core.setMatrix(slot, index, INSTANCE.matrix);
    }
  }

  private writeImpact(slot: BurstSlot, spent: number): void {
    const fade = 1 - spent;
    const travel = spent * slot.motion;
    for (let index = 0; index < slot.count; index += 1) {
      INSTANCE.position.set(slot.x, slot.y, slot.z);
      INSTANCE.quaternion.identity();
      let shape: InstancedMesh | null = null;
      let colour = slot.colour;
      let intensity = fade;
      if (slot.family === 'ripple') {
        shape = this.shapes.flare;
        INSTANCE.rotation.set(-Math.PI / 2, 0, 0);
        INSTANCE.scale.setScalar(slot.scale * (2 + spent * 7));
        intensity = fade * .4;
      } else if (slot.family === 'ballistic') {
        const angle = slot.bearing + Math.sin(index * 2.4) * 1.1;
        const speed = slot.scale * (12 + index * 3.2);
        const height = (2.8 + index % 3 * 1.5) * slot.scale * travel - 4 * travel * travel;
        INSTANCE.position.add(DIRECTION.set(Math.cos(angle) * speed * travel, height, Math.sin(angle) * speed * travel));
        DIRECTION.set(Math.cos(angle), .25 - travel * .6, Math.sin(angle)).normalize();
        INSTANCE.quaternion.setFromUnitVectors(UP, DIRECTION);
        const size = slot.scale * (index === 0 ? .85 : .34) * (.5 + fade * .5);
        INSTANCE.scale.set(size, size * (index % 2 === 0 ? 2.6 : 5), size * .48);
        colour = index % 2 === 0 ? 0xb4c4bd : 0xffd5a0;
      } else if (slot.family === 'energy') {
        const size = slot.scale * (index === 0 ? 1.3 : 2.3) * (1 + spent * .75);
        if (index === 0) {
          INSTANCE.scale.set(size, size * .55, size);
          colour = 0xeaffed;
        } else {
          shape = this.shapes.flare;
          INSTANCE.position.y += .25;
          INSTANCE.rotation.set(index === 1 ? -Math.PI / 2 : 0, index === 1 ? 0 : slot.bearing, 0);
          INSTANCE.scale.setScalar(size);
          intensity = fade * fade * .65;
        }
      } else {
        const angle = index * 2.399963;
        if (index === slot.count - 1 && index > 0) {
          shape = this.shapes.flare;
          INSTANCE.position.y += .25;
          INSTANCE.rotation.set(-Math.PI / 2, 0, 0);
          INSTANCE.scale.setScalar(slot.scale * (2.3 + spent * 8 * (0.25 + slot.motion * .75)));
          intensity = fade * fade * .4;
        } else {
          shape = this.shapes.blast;
          const reach = slot.scale * (index + .5) * travel;
          INSTANCE.position.add(DIRECTION.set(Math.cos(angle) * reach, travel * slot.scale * (3 + index), Math.sin(angle) * reach));
          const size = slot.scale * (index === 0 ? 2.1 : 1.4) * (1 + spent * 1.8);
          INSTANCE.scale.set(size, size * .8, size);
          colour = index === 0 ? 0xffe3ad : 0xfa8a43;
          intensity = fade * fade;
        }
      }
      INSTANCE.updateMatrix();
      if (shape === null) {
        this.core.setMatrix(slot, index, INSTANCE.matrix);
        // Colours vary within one event: cool plate fragments and hot sparks remain distinct.
        this.shapes.write(this.mesh, slot.start + index, INSTANCE.matrix, colour, intensity * slot.opacity);
      } else this.shapes.write(shape, slot.start + index, INSTANCE.matrix, colour, intensity * slot.opacity);
    }
  }
}
