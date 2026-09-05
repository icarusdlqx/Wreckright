import {
  AdditiveBlending, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh,
  Matrix4, MeshBasicMaterial, RingGeometry, SphereGeometry,
} from 'three';

const HIDDEN = new Matrix4().makeScale(0, 0, 0);

/** Alternate geometry shares the burst pool's admission, slots and lifetime. */
export class ImpactShapeBatches {
  readonly flare: InstancedMesh;
  readonly blast: InstancedMesh;
  private readonly meshes: readonly InstancedMesh[];

  constructor(capacity: number, private readonly instancesPerSlot: number) {
    const material = (): MeshBasicMaterial => new MeshBasicMaterial({
      color: 0xffffff, vertexColors: false, transparent: true, opacity: 1,
      blending: AdditiveBlending, depthWrite: false, side: DoubleSide, forceSinglePass: true,
    });
    this.flare = new InstancedMesh(new RingGeometry(.48, 1, 16), material(), capacity * 2);
    this.blast = new InstancedMesh(new SphereGeometry(1, 6, 4), material(), capacity * 4);
    this.flare.name = 'shot-contact-flare';
    this.blast.name = 'shot-blast-lobes';
    this.meshes = [this.flare, this.blast];
    for (const mesh of this.meshes) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(mesh.count * 3), 3);
      for (let index = 0; index < mesh.count; index += 1) mesh.setMatrixAt(index, HIDDEN);
    }
    this.commit();
  }

  hide(start: number, count: number): void {
    const firstSlot = Math.floor(start / this.instancesPerSlot);
    const endSlot = Math.ceil((start + count) / this.instancesPerSlot);
    for (let slot = firstSlot; slot < endSlot; slot += 1) {
      for (let index = 0; index < 2; index += 1) this.flare.setMatrixAt(slot * 2 + index, HIDDEN);
      for (let index = 0; index < 4; index += 1) this.blast.setMatrixAt(slot * 4 + index, HIDDEN);
    }
  }

  write(mesh: InstancedMesh, index: number, matrix: Matrix4, colour: number, intensity: number): void {
    const slot = Math.floor(index / this.instancesPerSlot);
    const offset = index % this.instancesPerSlot;
    const instance = mesh === this.flare ? slot * 2 + Math.min(1, Math.max(0, offset - 1))
      : mesh === this.blast ? slot * 4 + Math.min(3, offset) : index;
    mesh.setMatrixAt(instance, matrix);
    mesh.instanceColor?.setXYZ(instance,
      ((colour >> 16) & 255) / 255 * intensity,
      ((colour >> 8) & 255) / 255 * intensity,
      (colour & 255) / 255 * intensity);
  }

  commit(): void {
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    }
  }
}
