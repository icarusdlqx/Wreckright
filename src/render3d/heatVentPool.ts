import {
  AdditiveBlending,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { disposeObjectResources } from './sceneResources';
import { safeShotDelta } from './shotPoolCore';

interface VentSlot {
  age: number;
  life: number;
  x: number;
  y: number;
  z: number;
  driftX: number;
  driftZ: number;
  size: number;
}

const HIDDEN = new Matrix4().makeScale(0, 0, 0);
const AT = new Vector3();
const SIZE = new Vector3();
const MATRIX = new Matrix4();
const NO_TURN = new Quaternion();
const LIFE = 0.85;
const RISE = 11;

/** A ring of short-lived puffs; a hot lance never allocates a particle mid-fight. */
export class HeatVentPool {
  readonly mesh: InstancedMesh;
  private readonly slots: VentSlot[];
  private cursor = 0;
  private disposed = false;

  constructor(readonly capacity = 64) {
    this.mesh = new InstancedMesh(
      new SphereGeometry(1, 6, 5),
      new MeshBasicMaterial({
        color: 0x9aa6ad,
        transparent: true,
        opacity: 0.07,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
      capacity,
    );
    this.mesh.name = 'heat-vents';
    this.mesh.frustumCulled = false;
    this.slots = Array.from({ length: capacity }, () => ({
      age: LIFE, life: LIFE, x: 0, y: 0, z: 0, driftX: 0, driftZ: 0, size: 1,
    }));
    for (let index = 0; index < capacity; index += 1) this.mesh.setMatrixAt(index, HIDDEN);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** The seed spreads puffs around the vent so one torso never stacks a column. */
  spawn(x: number, y: number, z: number, seed: number, size: number): void {
    if (this.disposed) return;
    const slot = this.slots[this.cursor];
    if (slot === undefined) return;
    const index = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const angle = (seed % 11) * 0.571 + (seed % 7) * 0.9;
    slot.age = 0;
    slot.life = LIFE;
    slot.x = x + Math.cos(angle) * size * 0.6;
    slot.y = y;
    slot.z = z + Math.sin(angle) * size * 0.6;
    slot.driftX = Math.cos(angle * 1.7) * 3;
    slot.driftZ = Math.sin(angle * 1.3) * 3;
    slot.size = Math.max(0.3, size);
    this.write(slot, index);
  }

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    const delta = safeShotDelta(deltaSeconds);
    for (let index = 0; index < this.slots.length; index += 1) {
      const slot = this.slots[index];
      if (slot === undefined || slot.age >= slot.life) continue;
      slot.age += delta;
      if (slot.age >= slot.life) {
        this.mesh.setMatrixAt(index, HIDDEN);
        continue;
      }
      slot.x += slot.driftX * delta;
      slot.y += RISE * delta;
      slot.z += slot.driftZ * delta;
      this.write(slot, index);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  get active(): number {
    let count = 0;
    for (const slot of this.slots) if (slot.age < slot.life) count += 1;
    return count;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeObjectResources(this.mesh);
  }

  private write(slot: VentSlot, index: number): void {
    const spent = slot.age / slot.life;
    AT.set(slot.x, slot.y, slot.z);
    SIZE.setScalar(slot.size * (0.6 + spent * 1.8) * (1 - spent * spent));
    this.mesh.setMatrixAt(index, MATRIX.compose(AT, NO_TURN, SIZE));
  }
}
