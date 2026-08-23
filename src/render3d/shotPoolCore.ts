import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
} from 'three';

export interface ShotSlot {
  active: boolean;
  remaining: number;
  life: number;
  colour: number;
  opacity: number;
  count: number;
  start: number;
  priority: ShotPriority;
  generation: number;
}

export type ShotPriority = 0 | 1 | 2 | 3;

export const SHOT_PRIORITY = Object.freeze({
  decoration: 0,
  standard: 1,
  critical: 2,
  terminal: 3,
} satisfies Record<string, ShotPriority>);

export interface ShotPoolSnapshot {
  readonly capacity: number;
  readonly active: number;
  readonly physicalCapacity: number;
  readonly dropped: number;
  readonly evicted: number;
}

const HIDDEN = new Matrix4().makeScale(0, 0, 0);

/** Fixed storage evicts only cues at or below the incoming presentation priority. */
export class ShotPoolCore<T extends ShotSlot> {
  readonly slots: readonly T[];
  private cursor = 0;
  private activeSlots = 0;
  private generation = 0;
  private dropped = 0;
  private evicted = 0;

  constructor(
    readonly mesh: InstancedMesh,
    readonly capacity: number,
    readonly instancesPerSlot: number,
    makeSlot: (index: number) => T,
  ) {
    this.slots = Array.from({ length: capacity }, (_, index) => makeSlot(index));
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.instanceColor = new InstancedBufferAttribute(
      new Float32Array(mesh.count * 3),
      3,
    );
    for (let index = 0; index < mesh.count; index += 1) {
      mesh.setMatrixAt(index, HIDDEN);
      mesh.instanceColor.setXYZ(index, 0, 0, 0);
    }
    this.commit();
  }

  acquire(priority: ShotPriority = SHOT_PRIORITY.standard): T | null {
    let selected = -1;
    for (let offset = 0; offset < this.capacity; offset += 1) {
      const index = (this.cursor + offset) % this.capacity;
      if (this.slots[index]?.active === false) {
        selected = index;
        break;
      }
    }

    if (selected < 0) {
      let candidatePriority = Number.POSITIVE_INFINITY;
      let oldestGeneration = Number.POSITIVE_INFINITY;
      for (let offset = 0; offset < this.capacity; offset += 1) {
        const index = (this.cursor + offset) % this.capacity;
        const candidate = this.slots[index];
        if (candidate === undefined || candidate.priority > priority) continue;
        if (
          candidate.priority < candidatePriority ||
          (candidate.priority === candidatePriority && candidate.generation < oldestGeneration)
        ) {
          selected = index;
          candidatePriority = candidate.priority;
          oldestGeneration = candidate.generation;
        }
      }
      if (selected < 0) {
        this.dropped += 1;
        return null;
      }
      this.evicted += 1;
    }

    const slot = this.slots[selected];
    if (slot === undefined) throw new Error('shot pool has no slots');
    this.cursor = (selected + 1) % this.capacity;
    if (!slot.active) this.activeSlots += 1;
    this.hide(slot);
    slot.active = true;
    slot.priority = priority;
    slot.generation = this.generation;
    this.generation += 1;
    return slot;
  }

  configure(slot: T, life: number, count: number, colour: number, opacity: number): void {
    slot.life = Math.max(0.001, life);
    slot.remaining = slot.life;
    slot.count = Math.max(1, Math.min(this.instancesPerSlot, Math.floor(count)));
    slot.colour = colour;
    slot.opacity = opacity;
  }

  expire(slot: T): void {
    if (!slot.active) return;
    slot.active = false;
    slot.remaining = 0;
    this.activeSlots -= 1;
    this.hide(slot);
  }

  setMatrix(slot: T, offset: number, matrix: Matrix4): void {
    if (offset < 0 || offset >= slot.count) return;
    this.mesh.setMatrixAt(slot.start + offset, matrix);
  }

  setColour(slot: T, offset: number, intensity: number): void {
    if (offset < 0 || offset >= slot.count) return;
    const strength = Math.max(0, intensity) * slot.opacity;
    this.mesh.instanceColor?.setXYZ(
      slot.start + offset,
      ((slot.colour >> 16) & 0xff) / 255 * strength,
      ((slot.colour >> 8) & 0xff) / 255 * strength,
      (slot.colour & 0xff) / 255 * strength,
    );
  }

  commit(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor !== null) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    for (const slot of this.slots) {
      slot.active = false;
      slot.remaining = 0;
      slot.priority = SHOT_PRIORITY.decoration;
      slot.generation = 0;
      this.hide(slot);
    }
    this.activeSlots = 0;
    this.cursor = 0;
    this.generation = 0;
    this.dropped = 0;
    this.evicted = 0;
    this.commit();
  }

  snapshot(): ShotPoolSnapshot {
    return {
      capacity: this.capacity,
      active: this.activeSlots,
      physicalCapacity: this.mesh.count,
      dropped: this.dropped,
      evicted: this.evicted,
    };
  }

  private hide(slot: T): void {
    for (let index = 0; index < this.instancesPerSlot; index += 1) {
      this.mesh.setMatrixAt(slot.start + index, HIDDEN);
      this.mesh.instanceColor?.setXYZ(slot.start + index, 0, 0, 0);
    }
  }
}

export function baseShotSlot(start: number): ShotSlot {
  return {
    active: false,
    remaining: 0,
    life: 0.001,
    colour: 0xffffff,
    opacity: 1,
    count: 1,
    start,
    priority: SHOT_PRIORITY.decoration,
    generation: 0,
  };
}

export function safeShotDelta(deltaSeconds: number): number {
  return Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
}
