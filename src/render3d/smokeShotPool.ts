import {
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  type Vector3,
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
  flatten: number;
}

const INSTANCE = new Object3D();

function smokeMaterial(): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: false,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  // Smoke fades in alpha rather than turning into luminous grey or opaque black.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute float smokeOpacity; varying float vSmokeOpacity;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\nvSmokeOpacity = smokeOpacity;');
    shader.fragmentShader = 'varying float vSmokeOpacity;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vSmokeOpacity;');
  };
  material.customProgramCacheKey = () => 'pooled-smoke-opacity-v1';
  return material;
}

export class SmokeShotPool {
  readonly mesh: InstancedMesh;
  private readonly core: ShotPoolCore<SmokeSlot>;
  private readonly opacity: InstancedBufferAttribute;

  constructor(capacity: number) {
    this.mesh = new InstancedMesh(new SphereGeometry(4.5, 7, 6), smokeMaterial(), capacity);
    this.mesh.name = 'shot-smoke';
    this.opacity = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.mesh.geometry.setAttribute('smokeOpacity', this.opacity);
    this.core = new ShotPoolCore(this.mesh, capacity, 1, (index) => ({
      ...baseShotSlot(index),
      x: 0,
      y: 0,
      z: 0,
      scale: 1,
      rise: 13,
      grow: 2.4,
      flatten: 1,
    }));
  }

  spawn(at: Vec2, ground: number, lifeScale: number): void {
    this.puff(at.x, ground + 14, at.y, 2.6 * lifeScale, 1, 13, 2.4, 1, 0x626a67, .38);
  }

  blast(at: Vec2, height: number, scale: number): void {
    this.puff(at.x, height, at.y, .85, Math.min(1.5, scale) * .6, 7, 1.8, .8, 0x555e57, .46);
  }

  dust(at: Vec2, height: number, scale: number): void {
    this.puff(at.x, height + .4, at.y, .62, scale * .75, 2, 1.8, .18, 0xaaa98b, .3);
  }

  steam(at: Vector3): void {
    this.puff(at.x, at.y, at.z, .9, .3, 10, 1.3, 1.3, 0xd3e3d8, .22);
  }

  private puff(x: number, y: number, z: number, life: number, scale: number, rise: number, grow: number, flatten: number, colour: number, opacity: number): void {
    const slot = this.core.acquire(SHOT_PRIORITY.decoration);
    if (slot === null) return;
    slot.x = x; slot.y = y; slot.z = z;
    slot.scale = Math.max(.1, scale); slot.rise = rise; slot.grow = grow; slot.flatten = flatten;
    this.core.configure(slot, life, 1, colour, opacity);
    this.writeMatrix(slot, 0);
    this.core.setColour(slot, 0, 1 / opacity);
    this.opacity.setX(slot.start, opacity);
    this.opacity.needsUpdate = true;
    this.core.commit();
  }

  update(deltaSeconds: number): void {
    const delta = safeShotDelta(deltaSeconds);
    for (const slot of this.core.slots) {
      if (!slot.active) continue;
      slot.remaining -= delta;
      if (slot.remaining <= 0) {
        this.core.expire(slot);
        this.opacity.setX(slot.start, 0);
        continue;
      }
      const spent = 1 - slot.remaining / slot.life;
      this.writeMatrix(slot, spent);
      this.opacity.setX(slot.start, slot.opacity * (1 - spent) ** 2);
    }
    this.core.commit();
    this.opacity.needsUpdate = true;
  }

  snapshot(): ShotPoolSnapshot {
    return this.core.snapshot();
  }

  clear(): void {
    this.core.clear();
    this.opacity.array.fill(0);
    this.opacity.needsUpdate = true;
  }

  private writeMatrix(slot: SmokeSlot, spent: number): void {
    const growth = 1 + spent * slot.grow;
    INSTANCE.position.set(slot.x, slot.y + spent * slot.life * slot.rise, slot.z);
    INSTANCE.quaternion.identity();
    INSTANCE.scale.set(slot.scale * growth, slot.scale * growth * slot.flatten, slot.scale * growth);
    INSTANCE.updateMatrix();
    this.core.setMatrix(slot, 0, INSTANCE.matrix);
  }
}
