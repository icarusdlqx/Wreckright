import {
  BufferGeometry,
  Box3,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
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
  corners: Vector3[];
  bounces: number;
}

const CENTRE = new Vector3();
const PART_AT = new Vector3();
const LOCAL_MATRIX = new Matrix4();
const CENTRE_INVERSE = new Matrix4();
const LOCAL_POSITION = new Vector3();
const LOCAL_ROTATION = new Quaternion();
const LOCAL_SCALE = new Vector3();
const MAX_DETACHED_PARTS = 12;
const BOUNDS = new Box3();
const CORNER = new Vector3();

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
        corners: Array.from({ length: 8 }, () => new Vector3()),
        bounces: 0,
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

    const side = location.startsWith('left') ? 1
      : location.startsWith('right') ? -1 : seed % 2 === 0 ? 1 : -1;
    const heading = Math.atan2(source.matrixWorld.elements[2] ?? 0, source.matrixWorld.elements[0] ?? 1);
    const drift = heading + side * Math.PI * 0.48 + ((seed % 7) - 3) * 0.045;
    const speed = this.reducedMotion ? 1.5 : this.lowFx ? 5.5 : 8;
    // The hull centre is not its contact surface: keep a rotated arm above the soil.
    slot.root.position.set(0, 0, 0);
    slot.root.rotation.set(0, 0, 0);
    slot.root.updateMatrixWorld(true);
    BOUNDS.setFromObject(slot.root);
    for (let index = 0; index < 8; index += 1) slot.corners[index]?.set(
      index & 1 ? BOUNDS.max.x : BOUNDS.min.x,
      index & 2 ? BOUNDS.max.y : BOUNDS.min.y,
      index & 4 ? BOUNDS.max.z : BOUNDS.min.z,
    );
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
    slot.bounces = 0;
    slot.root.visible = true;
    return true;
  }

  advance(deltaSeconds: number): void {
    if (this.destroyed) return;
    const dt = Number.isFinite(deltaSeconds) ? Math.min(0.1, Math.max(0, deltaSeconds)) : 0;
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.age += dt;
      if (!slot.settled) {
        slot.velocity.y -= 28 * dt;
        slot.root.position.addScaledVector(slot.velocity, dt);
        slot.root.rotation.x += slot.spin.x * dt;
        slot.root.rotation.y += slot.spin.y * dt;
        slot.root.rotation.z += slot.spin.z * dt;
        let lowest = 0;
        for (const corner of slot.corners) lowest = Math.min(lowest, CORNER.copy(corner).applyQuaternion(slot.root.quaternion).y);
        const ground = this.heightAt(slot.root.position.x, slot.root.position.z) + .25 - lowest;
        if (slot.root.position.y <= ground) {
          slot.root.position.y = ground;
          if (!this.reducedMotion && !this.lowFx && slot.bounces === 0 && slot.velocity.y < -3) {
            slot.velocity.y = -slot.velocity.y * .22;
            slot.velocity.x *= .62; slot.velocity.z *= .62;
            slot.spin.multiplyScalar(.4); slot.bounces += 1;
          } else {
            slot.velocity.y = 0;
            const friction = Math.exp(-dt * 9);
            slot.velocity.x *= friction; slot.velocity.z *= friction; slot.spin.multiplyScalar(friction);
            if (slot.velocity.lengthSq() < .12) {
              slot.velocity.set(0, 0, 0); slot.spin.set(0, 0, 0); slot.settled = true;
            }
          }
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
  const lowerLeg = location === 'left_leg' || location === 'right_leg';
  root.traverse((node) => {
    if (!(node instanceof Mesh) || node instanceof InstancedMesh) return;
    const belongs = node.userData.damageLocation === location || detachedAncestorAt(node, location);
    if (belongs && (!lowerLeg || node.userData.limbJoint !== 'hip')) result.push(node);
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
  return location === 'left_arm' || location === 'right_arm' || location === 'head'
    || location === 'left_leg' || location === 'right_leg';
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
  if (copy instanceof MeshStandardMaterial && copy.emissive.getHex() !== 0) {
    // Detached optics lose their power feed; weak paint fill is not a luminous lens.
    if (copy.emissiveIntensity > 0.2) {
      copy.color.multiplyScalar(0.12);
      copy.roughness = 0.85;
    }
    copy.emissiveIntensity = 0;
  }
  cache.set(source, copy);
  return copy;
}
