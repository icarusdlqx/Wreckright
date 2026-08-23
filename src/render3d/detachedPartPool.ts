import {
  BufferGeometry,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  Quaternion,
  Scene,
  Vector3,
  type Object3D,
} from 'three';
import type { MechLocation } from '../schema/common';

interface DetachedSlot {
  root: Group;
  velocity: Vector3;
  spin: Vector3;
  age: number;
  active: boolean;
  settled: boolean;
}

const CENTRE = new Vector3();
const PART_AT = new Vector3();
const LOCAL_MATRIX = new Matrix4();
const CENTRE_INVERSE = new Matrix4();
const LOCAL_POSITION = new Vector3();
const LOCAL_ROTATION = new Quaternion();
const LOCAL_SCALE = new Vector3();
const MAX_DETACHED_PARTS = 12;

/** Bounded battlefield wreckage; only a destruction event clones resources. */
export class DetachedPartPool {
  private readonly slots: DetachedSlot[];
  private cursor = 0;
  private lowFx = false;
  private destroyed = false;

  constructor(
    private readonly scene: Scene,
    private readonly heightAt: (x: number, y: number) => number,
    private readonly reducedMotion: boolean,
  ) {
    this.slots = Array.from({ length: MAX_DETACHED_PARTS }, () => {
      const root = new Group();
      root.name = 'detached-part-slot';
      root.visible = false;
      scene.add(root);
      return {
        root,
        velocity: new Vector3(),
        spin: new Vector3(),
        age: 0,
        active: false,
        settled: false,
      };
    });
  }

  setLowFx(lowFx: boolean): void {
    this.lowFx = lowFx;
  }

  spawn(source: Object3D, location: MechLocation, seed: number): boolean {
    if (this.destroyed || !isShedLocation(location)) return false;
    const parts = collectShedMeshes(source, location);
    if (parts.length === 0) return false;

    const slot = this.slots[this.cursor];
    if (slot === undefined) return false;
    this.cursor = (this.cursor + 1) % this.slots.length;
    this.clearSlot(slot);

    CENTRE.set(0, 0, 0);
    source.updateWorldMatrix(true, true);
    for (const part of parts) {
      PART_AT.setFromMatrixPosition(part.matrixWorld);
      CENTRE.add(PART_AT);
    }
    CENTRE.multiplyScalar(1 / parts.length);
    CENTRE_INVERSE.makeTranslation(-CENTRE.x, -CENTRE.y, -CENTRE.z);

    const geometries = new Map<BufferGeometry, BufferGeometry>();
    const materials = new Map<Material, Material>();
    for (const part of parts) {
      const geometry = cloneGeometry(part.geometry, geometries);
      const material = Array.isArray(part.material)
        ? part.material.map((entry) => cloneMaterial(entry, materials))
        : cloneMaterial(part.material, materials);
      const copy = new Mesh(geometry, material);
      copy.castShadow = part.castShadow;
      copy.receiveShadow = part.receiveShadow;
      copy.visible = part.visible;
      LOCAL_MATRIX.multiplyMatrices(CENTRE_INVERSE, part.matrixWorld);
      LOCAL_MATRIX.decompose(LOCAL_POSITION, LOCAL_ROTATION, LOCAL_SCALE);
      copy.position.copy(LOCAL_POSITION);
      copy.quaternion.copy(LOCAL_ROTATION);
      copy.scale.copy(LOCAL_SCALE);
      slot.root.add(copy);
    }

    const side = location === 'left_arm' ? 1 : location === 'right_arm' ? -1 : seed % 2 === 0 ? 1 : -1;
    const heading = Math.atan2(source.matrixWorld.elements[2] ?? 0, source.matrixWorld.elements[0] ?? 1);
    const drift = heading + side * Math.PI * 0.48 + ((seed % 7) - 3) * 0.045;
    const speed = this.reducedMotion ? 1.5 : this.lowFx ? 5.5 : 8;
    slot.root.position.copy(CENTRE);
    slot.root.rotation.set(0, 0, 0);
    slot.velocity.set(Math.cos(drift) * speed, this.reducedMotion ? 2 : 10, Math.sin(drift) * speed);
    slot.spin.set(
      this.reducedMotion || this.lowFx ? 0 : 1.6 * side,
      this.reducedMotion || this.lowFx ? 0 : 1.1 + (seed % 5) * 0.18,
      this.reducedMotion ? 0 : 2.5 * side,
    );
    slot.age = 0;
    slot.active = true;
    slot.settled = false;
    slot.root.visible = true;
    return true;
  }

  advance(deltaSeconds: number): void {
    if (this.destroyed) return;
    const dt = Math.min(0.1, Math.max(0, deltaSeconds));
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.age += dt;
      if (!slot.settled) {
        slot.velocity.y -= 28 * dt;
        slot.root.position.addScaledVector(slot.velocity, dt);
        slot.root.rotation.x += slot.spin.x * dt;
        slot.root.rotation.y += slot.spin.y * dt;
        slot.root.rotation.z += slot.spin.z * dt;
        const ground = this.heightAt(slot.root.position.x, slot.root.position.z) + 0.4;
        if (slot.root.position.y <= ground) {
          slot.root.position.y = ground;
          slot.velocity.set(0, 0, 0);
          slot.spin.set(0, 0, 0);
          slot.settled = true;
        }
      }
      if (slot.age >= (this.lowFx ? 4 : 8)) this.clearSlot(slot);
    }
  }

  activeCount(): number {
    let active = 0;
    for (const slot of this.slots) if (slot.active) active += 1;
    return active;
  }

  dispose(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const slot of this.slots) {
      this.clearSlot(slot);
      this.scene.remove(slot.root);
    }
  }

  private clearSlot(slot: DetachedSlot): void {
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    for (const child of [...slot.root.children]) {
      child.traverse((node) => {
        if (!(node instanceof Mesh)) return;
        geometries.add(node.geometry);
        if (Array.isArray(node.material)) node.material.forEach((entry) => materials.add(entry));
        else materials.add(node.material);
      });
      slot.root.remove(child);
    }
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    slot.active = false;
    slot.settled = false;
    slot.root.visible = false;
  }
}

function collectShedMeshes(root: Object3D, location: MechLocation): Mesh[] {
  const result: Mesh[] = [];
  root.traverse((node) => {
    if (!(node instanceof Mesh) || node instanceof InstancedMesh) return;
    if (node.userData.damageLocation === location || detachedAncestorAt(node, location)) result.push(node);
  });
  return result;
}

function detachedAncestorAt(node: Object3D, location: MechLocation): boolean {
  let parent = node.parent;
  while (parent !== null) {
    if (parent.userData.detachmentLocation === location) return true;
    parent = parent.parent;
  }
  return false;
}

function isShedLocation(location: MechLocation): boolean {
  return location === 'left_arm' || location === 'right_arm' || location === 'head';
}

function cloneGeometry(
  source: BufferGeometry,
  cache: Map<BufferGeometry, BufferGeometry>,
): BufferGeometry {
  const existing = cache.get(source);
  if (existing !== undefined) return existing;
  const copy = source.clone();
  cache.set(source, copy);
  return copy;
}

function cloneMaterial(source: Material, cache: Map<Material, Material>): Material {
  const existing = cache.get(source);
  if (existing !== undefined) return existing;
  const copy = source.clone();
  cache.set(source, copy);
  return copy;
}
