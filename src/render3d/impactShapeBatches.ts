import {
  AdditiveBlending, BoxGeometry, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh,
  Matrix4, MeshBasicMaterial, NormalBlending, RingGeometry, SphereGeometry,
} from 'three';

const HIDDEN = new Matrix4().makeScale(0, 0, 0);

/** Alternate geometry shares the burst pool's admission, slots and lifetime. */
export class ImpactShapeBatches {
  readonly flare: InstancedMesh;
  readonly blast: InstancedMesh;
  readonly plates: InstancedMesh;
  private readonly meshes: readonly InstancedMesh[];
  private readonly active: readonly Uint8Array[];

  constructor(capacity: number, private readonly instancesPerSlot: number) {
    const material = (): MeshBasicMaterial => new MeshBasicMaterial({
      color: 0xffffff, vertexColors: false, transparent: true, opacity: 1,
      blending: AdditiveBlending, depthWrite: false, side: DoubleSide, forceSinglePass: true,
    });
    this.flare = new InstancedMesh(new RingGeometry(.48, 1, 16), material(), capacity * 2);
    const blastMaterial = material(); blastMaterial.blending = NormalBlending;
    this.blast = new InstancedMesh(new SphereGeometry(1, 10, 7), blastMaterial, capacity * 4);
    this.blast.geometry.setAttribute('blastOpacity', new InstancedBufferAttribute(new Float32Array(capacity * 4), 1));
    blastMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = 'attribute float blastOpacity; varying float vBlastOpacity; varying float vBlastShade;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlastOpacity = blastOpacity; vBlastShade = .7 + .3 * dot(normal, normalize(vec3(.4, .8, .3)));');
      shader.fragmentShader = 'varying float vBlastOpacity; varying float vBlastShade;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vBlastOpacity; diffuseColor.rgb *= vBlastShade;');
    };
    blastMaterial.customProgramCacheKey = () => 'layered-impact-fireball';
    this.plates = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0xffffff, vertexColors: false }), capacity * 6);
    this.flare.name = 'shot-contact-flare';
    this.blast.name = 'shot-blast-lobes';
    this.plates.name = 'shot-armour-fragments';
    this.meshes = [this.flare, this.blast, this.plates];
    this.active = this.meshes.map((mesh) => new Uint8Array(mesh.count));
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
      for (let batch = 0; batch < 3; batch += 1) {
        const perSlot = (batch + 1) * 2;
        for (let index = 0; index < perSlot; index += 1) {
          this.meshes[batch]?.setMatrixAt(slot * perSlot + index, HIDDEN);
          const active = this.active[batch]; if (active !== undefined) active[slot * perSlot + index] = 0;
        }
      }
    }
  }

  write(mesh: InstancedMesh, index: number, matrix: Matrix4, colour: number, intensity: number): void {
    const slot = Math.floor(index / this.instancesPerSlot);
    const offset = index % this.instancesPerSlot;
    const instance = mesh === this.flare ? slot * 2 + Math.min(1, Math.max(0, offset - 1))
      : mesh === this.plates ? slot * 6 + Math.min(5, offset)
      : mesh === this.blast ? slot * 4 + Math.min(3, offset) : index;
    mesh.setMatrixAt(instance, matrix);
    const active = this.active[mesh === this.flare ? 0 : mesh === this.blast ? 1 : mesh === this.plates ? 2 : -1];
    if (active !== undefined) active[instance] = 1;
    if (mesh === this.blast) {
      (mesh.geometry.getAttribute('blastOpacity') as InstancedBufferAttribute).setX(instance, intensity);
      intensity = 1;
    }
    mesh.instanceColor?.setXYZ(instance,
      ((colour >> 16) & 255) / 255 * intensity,
      ((colour >> 8) & 255) / 255 * intensity,
      (colour & 255) / 255 * intensity);
  }

  commit(): void {
    for (let batch = 0; batch < this.meshes.length; batch += 1) {
      const mesh = this.meshes[batch]!; const active = this.active[batch]!;
      let highest = 0;
      for (let index = 0; index < active.length; index += 1) if (active[index] === 1) highest = index + 1;
      mesh.count = highest;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    }
    (this.blast.geometry.getAttribute('blastOpacity') as InstancedBufferAttribute).needsUpdate = true;
  }
}
