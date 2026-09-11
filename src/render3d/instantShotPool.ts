import {
  AdditiveBlending,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  NormalBlending,
  Object3D,
  SphereGeometry,
  Vector3,
} from 'three';
import {
  emptyProjectileTrack,
  writeProjectileTrack,
  type ProjectileTrack,
} from './projectilePresentation';
import {
  baseShotSlot,
  safeShotDelta,
  SHOT_PRIORITY,
  ShotPoolCore,
  type ShotPoolSnapshot,
  type ShotSlot,
} from './shotPoolCore';

interface PathSlot extends ShotSlot {
  track: ProjectileTrack;
  width: number;
  shooterId: number;
  targetId: number;
  weaponId: string;
  targetOffsetX: number;
  targetOffsetZ: number;
  presentationDelay: number;
  resolved: boolean;
}

export interface ProjectileEngagement {
  readonly shooterId: number;
  readonly targetId: number;
  readonly weaponId: string;
}

export type InstantShotStyle = 'beam' | 'pulse' | 'bolt' | 'flame';

const UP = new Vector3(0, 1, 0);
const FROM = new Vector3();
const TO = new Vector3();
const DIRECTION = new Vector3();
const INSTANCE = new Object3D();
const DETAIL = new Object3D();
const HIDDEN = new Matrix4().makeScale(0, 0, 0);

function poolMaterial(opacity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: 0xffffff,
    // Enabling geometry colours would multiply these instance-only colours by black.
    vertexColors: false,
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}

function pathSlot(start: number): PathSlot {
  return {
    ...baseShotSlot(start),
    track: emptyProjectileTrack(),
    width: 1,
    shooterId: -1,
    targetId: -1,
    weaponId: '',
    targetOffsetX: 0,
    targetOffsetZ: 0,
    presentationDelay: 0,
    resolved: true,
  };
}

function pathPoint(track: ProjectileTrack, progress: number): void {
  INSTANCE.position.set(
    track.fromX + (track.toX - track.fromX) * progress,
    track.fromY + (track.toY - track.fromY) * progress,
    track.fromZ + (track.toZ - track.fromZ) * progress,
  );
}

/** Instant reads share one batch per authored family. */
export class InstantShotPool {
  readonly mesh: InstancedMesh;
  readonly detail: InstancedMesh;
  private readonly core: ShotPoolCore<PathSlot>;
  private readonly flameOpacity: InstancedBufferAttribute | null;

  constructor(
    readonly style: InstantShotStyle,
    capacity: number,
    instancesPerSlot: number,
  ) {
    const geometry = style === 'flame'
      ? new SphereGeometry(1, 10, 7)
      : new CylinderGeometry(1, 1, 1, 8);
    this.mesh = new InstancedMesh(geometry, poolMaterial(), capacity * instancesPerSlot);
    this.mesh.name = `shot-${style}`;
    this.detail = new InstancedMesh(geometry.clone(), poolMaterial(), capacity * instancesPerSlot);
    this.detail.name = `shot-${style}-core`;
    this.flameOpacity = style === 'flame'
      ? new InstancedBufferAttribute(new Float32Array(capacity * instancesPerSlot), 1) : null;
    if (style === 'flame') {
      const material = this.mesh.material as MeshBasicMaterial;
      material.blending = NormalBlending;
      geometry.setAttribute('flameOpacity', this.flameOpacity!);
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = 'attribute float flameOpacity; varying float vFlameOpacity;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\nvFlameOpacity = flameOpacity;');
        shader.fragmentShader = 'varying float vFlameOpacity;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFlameOpacity;');
      };
      material.customProgramCacheKey = () => 'flame-lobe-opacity';
    }
    this.detail.frustumCulled = false;
    this.detail.instanceMatrix.setUsage(DynamicDrawUsage);
    this.detail.instanceColor = new InstancedBufferAttribute(new Float32Array(this.detail.count * 3), 3);
    for (let index = 0; index < this.detail.count; index += 1) this.detail.setMatrixAt(index, HIDDEN);
    this.core = new ShotPoolCore(this.mesh, capacity, instancesPerSlot, (index) => (
      pathSlot(index * instancesPerSlot)
    ));
    this.detail.count = 0;
  }

  setDetailEnabled(enabled: boolean): void { this.detail.visible = enabled; }

  spawn(
    from: Vector3,
    toX: number,
    toY: number,
    toZ: number,
    colour: number,
    width: number,
    life: number,
    detailScale: number,
    engagement: ProjectileEngagement | null = null,
  ): void {
    const slot = this.core.acquire(SHOT_PRIORITY.standard);
    if (slot === null) return;
    this.hideDetail(slot);
    writeProjectileTrack(slot.track, from, toX, toY, toZ, 0, 1);
    slot.width = width;
    slot.shooterId = engagement?.shooterId ?? -1;
    slot.targetId = engagement?.targetId ?? -1;
    slot.weaponId = engagement?.weaponId ?? '';
    slot.resolved = engagement === null;
    const count = this.style === 'beam'
      ? 1
      : Math.max(1, Math.ceil(this.core.instancesPerSlot * detailScale));
    const opacity = this.style === 'flame' ? 0.78 : this.style === 'bolt' ? 0.95 : 0.92;
    this.core.configure(slot, life, count, colour, opacity);
    this.writeMatrices(slot);
    this.colour(slot, 1);
    this.commit();
  }

  update(deltaSeconds: number): void {
    const delta = safeShotDelta(deltaSeconds);
    for (const slot of this.core.slots) {
      if (!slot.active) continue;
      slot.remaining -= delta;
      if (slot.remaining <= 0) {
        this.hideDetail(slot);
        this.core.expire(slot);
        continue;
      }
      const fade = slot.remaining / slot.life;
      this.colour(slot, fade);
    }
    this.commit();
  }

  snapshot(): ShotPoolSnapshot {
    return { ...this.core.snapshot(), physicalCapacity: this.mesh.instanceMatrix.count + this.detail.instanceMatrix.count };
  }

  clear(): void {
    this.core.clear();
    for (let index = 0; index < this.detail.count; index += 1) this.detail.setMatrixAt(index, HIDDEN);
    this.commit();
  }

  /** The same hit that emits a contact flare also fixes this beam's endpoint. */
  resolve(engagement: ProjectileEngagement, endpoint: Vector3): boolean {
    let found: PathSlot | null = null;
    for (const slot of this.core.slots) {
      if (!slot.active || slot.resolved || slot.shooterId !== engagement.shooterId ||
        slot.targetId !== engagement.targetId || slot.weaponId !== engagement.weaponId) continue;
      if (found === null || slot.generation < found.generation) found = slot;
    }
    if (found === null) return false;
    found.track.toX = endpoint.x; found.track.toY = endpoint.y; found.track.toZ = endpoint.z;
    found.resolved = true;
    this.writeMatrices(found);
    this.commit();
    return true;
  }

  private writeMatrices(slot: PathSlot): void {
    if (this.style === 'beam') {
      FROM.set(slot.track.fromX, slot.track.fromY, slot.track.fromZ);
      TO.set(slot.track.toX, slot.track.toY, slot.track.toZ);
      DIRECTION.subVectors(TO, FROM);
      const length = DIRECTION.length();
      INSTANCE.position.addVectors(FROM, TO).multiplyScalar(0.5);
      INSTANCE.quaternion.setFromUnitVectors(UP, DIRECTION.multiplyScalar(1 / Math.max(0.001, length)));
      INSTANCE.scale.set(slot.width * 0.32, length, slot.width * 0.32);
      INSTANCE.updateMatrix();
      this.core.setMatrix(slot, 0, INSTANCE.matrix);
      this.writeDetail(slot, 0, .31);
      return;
    }

    const distance = Math.hypot(
      slot.track.toX - slot.track.fromX,
      slot.track.toY - slot.track.fromY,
      slot.track.toZ - slot.track.fromZ,
    );
    for (let index = 0; index < slot.count; index += 1) {
      const progress = this.style === 'pulse'
        ? (index + 0.5) / slot.count
        : (index + 1) / slot.count;
      pathPoint(slot.track, progress);
      if (this.style === 'pulse') {
        DIRECTION.set(
          slot.track.toX - slot.track.fromX,
          slot.track.toY - slot.track.fromY,
          slot.track.toZ - slot.track.fromZ,
        ).normalize();
        INSTANCE.quaternion.setFromUnitVectors(UP, DIRECTION);
        INSTANCE.scale.set(slot.width * 0.38, distance * 0.1, slot.width * 0.38);
      } else if (this.style === 'bolt') {
        // Joining irregular segments reads as a particle discharge instead of scattered beads.
        const previous = index / slot.count;
        const envelope = Math.sin(progress * Math.PI);
        TO.copy(INSTANCE.position);
        TO.y += Math.sin(index * 2.3) * slot.width * .85 * envelope;
        TO.z += Math.cos(index * 1.7) * slot.width * .65 * envelope;
        pathPoint(slot.track, previous);
        FROM.copy(INSTANCE.position);
        FROM.y += Math.sin((index - 1) * 2.3) * slot.width * .85 * Math.sin(previous * Math.PI);
        FROM.z += Math.cos((index - 1) * 1.7) * slot.width * .65 * Math.sin(previous * Math.PI);
        DIRECTION.subVectors(TO, FROM);
        const length = DIRECTION.length();
        INSTANCE.position.addVectors(FROM, TO).multiplyScalar(.5);
        INSTANCE.quaternion.setFromUnitVectors(UP, DIRECTION.normalize());
        INSTANCE.scale.set(slot.width * .32, length + .1, slot.width * .32);
      } else {
        const spread = .4 + progress * 1.4;
        INSTANCE.position.y += Math.sin(index * 1.9) * slot.width * .3 * progress;
        INSTANCE.position.z += Math.cos(index * 1.4) * slot.width * .24 * progress;
        DIRECTION.set(slot.track.toX - slot.track.fromX, slot.track.toY - slot.track.fromY,
          slot.track.toZ - slot.track.fromZ).normalize();
        INSTANCE.quaternion.setFromUnitVectors(UP, DIRECTION);
        INSTANCE.scale.set(
          slot.width * spread, distance / slot.count * .75, slot.width * spread * .85,
        );
      }
      INSTANCE.updateMatrix();
      this.core.setMatrix(slot, index, INSTANCE.matrix);
      this.writeDetail(slot, index, this.style === 'flame' ? .52 : .34);
    }
  }

  private writeDetail(slot: PathSlot, index: number, fraction: number): void {
    DETAIL.position.copy(INSTANCE.position);
    DETAIL.quaternion.copy(INSTANCE.quaternion);
    DETAIL.scale.copy(INSTANCE.scale);
    DETAIL.scale.x *= fraction; DETAIL.scale.z *= fraction;
    DETAIL.updateMatrix();
    this.detail.setMatrixAt(slot.start + index, DETAIL.matrix);
  }

  private colour(slot: PathSlot, fade: number): void {
    for (let index = 0; index < slot.count; index += 1) {
      this.core.setColour(slot, index, fade * (this.style === 'flame' ? .68 : .62));
      const progress = index / Math.max(1, slot.count - 1);
      const strength = fade * slot.opacity;
      if (this.style === 'flame') {
        // Normal-blended fire disappears in alpha; fading its hue would leave opaque soot lobes.
        this.mesh.instanceColor?.setXYZ(slot.start + index, 1, .28 - progress * .16, .015);
        this.flameOpacity?.setX(slot.start + index, Math.pow(fade, 1.25) * .82);
      }
      this.detail.instanceColor?.setXYZ(slot.start + index, strength,
        strength * (this.style === 'flame' ? .7 - progress * .42 : .97),
        strength * (this.style === 'flame' ? .2 - progress * .18 : 1));
    }
  }

  private hideDetail(slot: PathSlot): void {
    for (let index = 0; index < this.core.instancesPerSlot; index += 1) this.detail.setMatrixAt(slot.start + index, HIDDEN);
  }

  private commit(): void {
    this.core.commit();
    let highest = 0;
    for (const slot of this.core.slots) if (slot.active) highest = slot.start + slot.count;
    this.detail.count = highest;
    this.detail.instanceMatrix.needsUpdate = true;
    if (this.detail.instanceColor !== null) this.detail.instanceColor.needsUpdate = true;
    if (this.flameOpacity !== null) this.flameOpacity.needsUpdate = true;
  }
}
