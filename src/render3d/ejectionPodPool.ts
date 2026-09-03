import {
  CapsuleGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { disposeObjectResources } from './sceneResources';
import { safeShotDelta } from './shotPoolCore';

interface PodSlot {
  age: number;
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  size: number;
}

const HIDDEN = new Matrix4().makeScale(0, 0, 0);
const AT = new Vector3();
const SIZE = new Vector3();
const MATRIX = new Matrix4();
const TURN = new Quaternion();
const AXIS = new Vector3(0.4, 0, 1).normalize();
const CAPACITY = 4;
const GRAVITY = 42;
const LIFE = 2.6;

/** Four pods cover any plausible number of crews leaving in the same second. */
export class EjectionPodPool {
  readonly mesh: InstancedMesh;
  private readonly slots: PodSlot[];
  private cursor = 0;
  private disposed = false;

  constructor() {
    this.mesh = new InstancedMesh(
      new CapsuleGeometry(1, 2.4, 3, 7),
      new MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.6, metalness: 0.25 }),
      CAPACITY,
    );
    this.mesh.name = 'ejection-pods';
    this.mesh.frustumCulled = false;
    this.slots = Array.from({ length: CAPACITY }, () => ({
      age: LIFE, life: LIFE, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, size: 1,
    }));
    for (let index = 0; index < CAPACITY; index += 1) this.mesh.setMatrixAt(index, HIDDEN);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** The pod leaves along a bearing keyed to the entity so replays agree. */
  launch(at: Vector3, seed: number, size: number): void {
    if (this.disposed) return;
    const slot = this.slots[this.cursor];
    if (slot === undefined) return;
    this.cursor = (this.cursor + 1) % CAPACITY;
    const bearing = (Math.abs(seed) % 360) * (Math.PI / 180);
    slot.age = 0;
    slot.life = LIFE;
    slot.x = at.x;
    slot.y = at.y;
    slot.z = at.z;
    slot.vx = Math.cos(bearing) * 14;
    slot.vz = Math.sin(bearing) * 14;
    slot.vy = 64;
    slot.spin = 0;
    slot.size = Math.max(0.6, size);
    this.write(slot, this.cursor === 0 ? CAPACITY - 1 : this.cursor - 1);
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
      slot.vy -= GRAVITY * delta;
      slot.x += slot.vx * delta;
      slot.y += slot.vy * delta;
      slot.z += slot.vz * delta;
      slot.spin += delta * 3.2;
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

  private write(slot: PodSlot, index: number): void {
    AT.set(slot.x, slot.y, slot.z);
    // The pod shrinks away in its last half second rather than blinking out.
    const fade = Math.min(1, (slot.life - slot.age) / 0.5);
    SIZE.setScalar(slot.size * fade);
    TURN.setFromAxisAngle(AXIS, slot.spin);
    this.mesh.setMatrixAt(index, MATRIX.compose(AT, TURN, SIZE));
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
