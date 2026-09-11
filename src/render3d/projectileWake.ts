import {
  DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4,
  MeshBasicMaterial, Object3D, SphereGeometry,
} from 'three';
import { placeProjectile, type ProjectileTrack, type ShotStyle } from './projectilePresentation';

const HIDDEN = new Matrix4().makeScale(0, 0, 0);
const INSTANCE = new Object3D();
const MOTOR_COLOUR = 0xfff1c9;

/** A round owns its wake slots, so trails share its visibility, retirement and fixed budget. */
export class ProjectileWake {
  readonly mesh: InstancedMesh;
  private readonly opacity: InstancedBufferAttribute;
  private readonly perRound: number;
  private readonly active: Uint8Array;
  private enabled = true;

  constructor(private readonly style: ShotStyle, capacity: number) {
    this.perRound = style === 'missile' ? 7 : 2;
    this.active = new Uint8Array(capacity);
    const count = capacity * this.perRound;
    const geometry = new SphereGeometry(1, 8, 5);
    this.opacity = new InstancedBufferAttribute(new Float32Array(count), 1);
    geometry.setAttribute('wakeOpacity', this.opacity);
    const material = new MeshBasicMaterial({ transparent: true, depthWrite: false, vertexColors: false });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = 'attribute float wakeOpacity; varying float vWakeOpacity;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\nvWakeOpacity = wakeOpacity;');
      shader.fragmentShader = 'varying float vWakeOpacity;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vWakeOpacity;');
    };
    material.customProgramCacheKey = () => 'weapon-wake-alpha';
    this.mesh = new InstancedMesh(geometry, material, count);
    this.mesh.name = `shot-${style === 'tracer' ? 'shell' : style}-wake`;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.clear();
  }

  setEnabled(enabled: boolean): void { this.enabled = enabled; this.mesh.visible = enabled; }

  write(round: number, track: ProjectileTrack, progress: number, width: number, colour: number, fade: number): void {
    if (!this.enabled) return;
    this.active[round] = 1;
    const distance = Math.hypot(track.toX - track.fromX, track.toY - track.fromY, track.toZ - track.fromZ);
    for (let index = 0; index < this.perRound; index += 1) {
      const offset = round * this.perRound + index;
      const behind = this.style === 'missile' ? index * 3.4 + 2.2 : index * 4.5 + 3;
      const sample = progress - behind / Math.max(1, distance);
      if (sample < 0) { this.mesh.setMatrixAt(offset, HIDDEN); continue; }
      placeProjectile(INSTANCE, track, sample, width);
      const motor = index === 0;
      if (this.style === 'missile') {
        const radius = Math.max(.5, width * .3) * (motor ? .58 : .65 + index * .18);
        INSTANCE.scale.set(motor ? 3.2 : 2, radius, radius);
      } else {
        const radius = Math.max(.13, width * .1) * (1 - index * .28);
        INSTANCE.scale.set(this.style === 'slug' ? 6 : 3, radius, radius);
      }
      INSTANCE.updateMatrix(); this.mesh.setMatrixAt(offset, INSTANCE.matrix);
      const tint = this.style === 'missile' ? motor ? MOTOR_COLOUR : 0x9faea7 : colour;
      this.mesh.instanceColor?.setXYZ(offset, ((tint >> 16) & 255) / 255, ((tint >> 8) & 255) / 255, (tint & 255) / 255);
      this.opacity.setX(offset, fade * (this.style === 'missile' && !motor ? .33 * (1 - index / this.perRound) : .8));
    }
  }

  hide(round: number): void {
    this.active[round] = 0;
    for (let index = 0; index < this.perRound; index += 1) this.mesh.setMatrixAt(round * this.perRound + index, HIDDEN);
  }

  clear(): void {
    for (let index = 0; index < this.mesh.instanceMatrix.count; index += 1) this.mesh.setMatrixAt(index, HIDDEN);
    this.active.fill(0);
    this.commit();
  }

  commit(): void {
    let highest = 0;
    for (let round = 0; round < this.active.length; round += 1) if (this.active[round] === 1) highest = (round + 1) * this.perRound;
    this.mesh.count = highest;
    this.mesh.instanceMatrix.needsUpdate = true; this.opacity.needsUpdate = true;
    if (this.mesh.instanceColor !== null) this.mesh.instanceColor.needsUpdate = true;
  }
}
