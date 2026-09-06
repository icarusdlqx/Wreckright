import {
  BufferAttribute, CircleGeometry, Color, DynamicDrawUsage, InstancedBufferAttribute,
  InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3,
} from 'three';
import type { Vec2 } from '../sim/types';
import { disposeObjectResources } from './sceneResources';

const HIDDEN = new Matrix4().makeScale(0, 0, 0);
const FLAT = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const AT = new Vector3();
const SIZE = new Vector3();
const MATRIX = new Matrix4();
const TINT = new Color();
const EARTH = new Color(0x4a3524);
const CRATER = new Color(0x21170f);
export const SCAR_SECONDS = 28;

/** Radial vertex alpha keeps the ground visible through the edge of every mark. */
export function softScarGeometry(): CircleGeometry {
  const geometry = new CircleGeometry(1, 16);
  const count = geometry.getAttribute('position').count;
  const colours = new Float32Array(count * 4);
  for (let index = 0; index < count; index += 1) {
    colours.set([1, 1, 1, index === 0 ? 1 : 0], index * 4);
  }
  geometry.setAttribute('color', new BufferAttribute(colours, 4));
  return geometry;
}

/** One mesh: short-lived gunfire marks cannot evict the reserved wreck/crater slots. */
export class ScarLayer {
  readonly mesh: InstancedMesh;
  private readonly opacity: InstancedBufferAttribute;
  private readonly ages: Float32Array;
  private readonly points: Float32Array;
  private nextScar = 0;
  private nextCrater = 0;
  private laidScars = 0;
  private laidCraters = 0;
  private disposed = false;

  constructor(private readonly scarCapacity = 128, private readonly craterCapacity = 128) {
    const capacity = Math.max(0, scarCapacity) + Math.max(0, craterCapacity);
    const material = new MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.46, depthWrite: false,
    });
    material.onBeforeCompile = (shader): void => {
      shader.vertexShader = `attribute float scarOpacity; varying float vScarOpacity;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvScarOpacity = scarOpacity;');
      shader.fragmentShader = `varying float vScarOpacity;\n${shader.fragmentShader}`
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vScarOpacity;');
    };
    material.customProgramCacheKey = (): string => 'soft-scar-opacity-v1';
    const geometry = softScarGeometry();
    this.opacity = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.opacity.setUsage(DynamicDrawUsage);
    geometry.setAttribute('scarOpacity', this.opacity);
    this.ages = new Float32Array(Math.max(0, scarCapacity)).fill(-1);
    this.points = new Float32Array(Math.max(0, scarCapacity) * 2);
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.name = 'scars';
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    this.mesh.renderOrder = 1;
    for (let slot = 0; slot < capacity; slot += 1) this.mesh.setMatrixAt(slot, HIDDEN);
  }

  get scarCount(): number { return this.laidScars; }
  get craterCount(): number { return this.laidCraters; }

  mark(at: Vec2, ground: number, radius: number, heat: number): void {
    if (this.disposed || this.scarCapacity <= 0) return;
    // A clustered volley leaves one scuff instead of stacking opaque discs.
    for (let slot = 0; slot < this.ages.length; slot += 1) {
      const age = this.ages[slot] ?? -1;
      if (age >= 0 && age < 2 && Math.hypot(at.x - this.points[slot * 2]!, at.y - this.points[slot * 2 + 1]!) < radius) return;
    }
    const slot = this.nextScar;
    this.nextScar = (this.nextScar + 1) % this.scarCapacity;
    if ((this.ages[slot] ?? -1) < 0) this.laidScars += 1;
    this.ages[slot] = 0;
    this.points[slot * 2] = at.x; this.points[slot * 2 + 1] = at.y;
    this.place(slot, at, ground, radius, TINT.setHex(0x241b16).lerp(EARTH, 1 - heat), 0.55);
  }

  crater(at: Vec2, ground: number, radius: number, depth = 0.5): void {
    if (this.disposed || this.craterCapacity <= 0) return;
    const slot = this.scarCapacity + this.nextCrater;
    this.nextCrater = (this.nextCrater + 1) % this.craterCapacity;
    this.laidCraters = Math.min(this.craterCapacity, this.laidCraters + 1);
    this.place(slot, at, ground, radius, TINT.copy(CRATER).lerp(EARTH, Math.max(0, Math.min(1, depth))), 1);
  }

  update(deltaSeconds: number): void {
    if (this.disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    for (let slot = 0; slot < this.ages.length; slot += 1) {
      const previous = this.ages[slot] ?? -1;
      if (previous < 0) continue;
      const age = previous + deltaSeconds;
      if (age >= SCAR_SECONDS) {
        this.ages[slot] = -1;
        this.laidScars -= 1;
        this.mesh.setMatrixAt(slot, HIDDEN);
        this.mesh.instanceMatrix.needsUpdate = true;
      } else this.ages[slot] = age;
      this.opacity.setX(slot, Math.max(0, 1 - age / SCAR_SECONDS) * 0.55);
      this.opacity.needsUpdate = true;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeObjectResources(this.mesh);
    this.nextScar = 0; this.nextCrater = 0;
    this.laidScars = 0; this.laidCraters = 0; this.mesh.count = 0;
  }

  private place(slot: number, at: Vec2, ground: number, radius: number, colour: Color, opacity: number): void {
    this.mesh.count = Math.max(this.mesh.count, slot + 1);
    AT.set(at.x, ground + 0.35, at.y);
    SIZE.set(radius, radius, radius);
    this.mesh.setMatrixAt(slot, MATRIX.compose(AT, FLAT, SIZE));
    this.mesh.setColorAt(slot, colour);
    this.opacity.setX(slot, opacity);
    this.opacity.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor !== null) this.mesh.instanceColor.needsUpdate = true;
  }
}
