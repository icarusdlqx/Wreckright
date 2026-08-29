import {
  BufferGeometry,
  CircleGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type InstancedBufferAttribute,
  type Material,
} from 'three';
import type { TerrainMapData } from '../schema/map';
import type { TeamVision } from '../sim/sensors';
import type { TerrainGrid } from '../sim/terrain';
import { disposeObjectResources } from './sceneResources';

const FIRE_CAPACITY = 128;
const SMOKE_PER_FIRE = 3;
/** Occupants use cell centre; a near-half anchor stays readable without bypassing depth. */
const FIRE_ANCHOR_LATERAL = 0.27;
const FIRE_ANCHOR_NEAR = 0.24;
const FLAME_LIFT = 2.25;
const UP = new Vector3(0, 1, 0);
const RIGHT = new Vector3(1, 0, 0);

interface FireCellView {
  phase: 'burning' | 'burnt';
  startedTick: number;
  burnoutTick: number;
}

export interface FirePresentationWorld {
  tick: number;
  vision: TeamVision | null;
  fire: { cells: Map<number, FireCellView> };
}

export interface TerrainFirePoolStats {
  capacity: number;
  active: number;
  mesh: InstancedMesh;
  geometry: BufferGeometry;
  material: Material;
  instances: InstancedBufferAttribute;
}

export interface TerrainFireStats {
  resourcePools: number;
  activeDrawCalls: number;
  disposed: boolean;
  pools: {
    flame: TerrainFirePoolStats;
    smoke: TerrainFirePoolStats;
    scorch: TerrainFirePoolStats;
  };
}

function terrainIdAt(data: TerrainMapData, column: number, row: number): string {
  return data.legend[data.tiles[row]?.[column] ?? ''] ?? 'open';
}

/** Integer-only visual noise keeps presentation stable without touching world RNG. */
function visualHash(cell: number, salt: number): number {
  let value = Math.imul(cell + 1, 0x45d9f3b) ^ Math.imul(salt + 17, 0x27d4eb2d);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x1_0000_0000;
}

function crossedFlameGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    -0.5, 0, 0, 0.5, 0, 0, 0, 1, 0,
    0, 0, -0.5, 0, 0, 0.5, 0, 1, 0,
  ], 3));
  geometry.computeBoundingSphere();
  geometry.name = 'terrain-fire-crossed-cards';
  return geometry;
}

function fixedPool(
  name: string,
  geometry: BufferGeometry,
  material: Material,
  capacity: number,
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.instanceMatrix.array.fill(0);
  mesh.count = 0;
  return mesh;
}

/** Fixed-budget, privacy-filtered fire visuals driven only by authoritative world state. */
export class TerrainFireLayer {
  readonly group = new Group();

  private readonly flame: InstancedMesh;
  private readonly smoke: InstancedMesh;
  private readonly scorch: InstancedMesh;
  private readonly scorchCapacity: number;
  private readonly scorchSlotByCell: Int32Array;
  private readonly observedScorch: Uint8Array;
  private readonly anchor = new Vector3();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale = new Vector3();
  private readonly matrix = new Matrix4();
  private elapsed = 0;
  private flameActive = 0;
  private smokeActive = 0;
  private scorchActive = 0;
  private lowFx = false;
  private reducedMotion: boolean;
  private disposed = false;

  constructor(
    private readonly grid: TerrainGrid,
    data: TerrainMapData,
    private readonly heightAt: (x: number, y: number) => number,
    reducedMotion = false,
  ) {
    this.reducedMotion = reducedMotion;
    this.group.name = 'terrain-fire';
    this.flame = fixedPool(
      'terrain-fire-flames',
      crossedFlameGeometry(),
      new MeshBasicMaterial({
        color: 0xff7b22,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        side: DoubleSide,
      }),
      FIRE_CAPACITY,
    );
    this.smoke = fixedPool(
      'terrain-fire-smoke',
      new SphereGeometry(1, 6, 4),
      new MeshLambertMaterial({
        color: 0x697078,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
      }),
      FIRE_CAPACITY * SMOKE_PER_FIRE,
    );

    const cells = grid.width * grid.height;
    this.scorchSlotByCell = new Int32Array(cells);
    this.scorchSlotByCell.fill(-1);
    this.observedScorch = new Uint8Array(cells);
    let scorchCapacity = 0;
    for (let row = 0; row < grid.height; row += 1) {
      for (let column = 0; column < grid.width; column += 1) {
        if (terrainIdAt(data, column, row) !== 'forest') continue;
        this.scorchSlotByCell[row * grid.width + column] = scorchCapacity;
        scorchCapacity += 1;
      }
    }
    this.scorchCapacity = scorchCapacity;
    this.scorch = fixedPool(
      'terrain-fire-scorch',
      new CircleGeometry(1, 12),
      new MeshLambertMaterial({ color: 0x28251f, transparent: true, opacity: 0.82 }),
      scorchCapacity,
    );
    this.group.add(this.scorch, this.flame, this.smoke);
  }

  setPresentationMode(lowFx: boolean, reducedMotion = this.reducedMotion): void {
    if (this.disposed) return;
    this.lowFx = lowFx;
    this.reducedMotion = reducedMotion;
  }

  draw(world: FirePresentationWorld, presentationDeltaSeconds: number): void {
    if (this.disposed) return;
    const delta = Number.isFinite(presentationDeltaSeconds)
      ? Math.max(0, presentationDeltaSeconds)
      : 0;
    if (!this.reducedMotion) this.elapsed += delta;
    let nextFlame = 0;
    let nextSmoke = 0;
    let flameChanged = false;
    let smokeChanged = false;

    for (let cell = 0; cell < this.scorchSlotByCell.length; cell += 1) {
      const state = world.fire.cells.get(cell);
      if (state === undefined) continue;
      const visible = world.vision === null || world.vision.tiles[cell] === 1;
      if (state.phase === 'burnt') {
        if (visible) this.observeBurnt(cell);
        continue;
      }
      if (!visible || nextFlame >= FIRE_CAPACITY) continue;
      const progress = Math.max(0, Math.min(1,
        (world.tick - state.startedTick) / Math.max(1, state.burnoutTick - state.startedTick),
      ));
      const anchor = this.anchorForCell(cell);
      flameChanged = this.placeFlame(
        nextFlame, cell, progress, anchor.x, anchor.z,
      ) || flameChanged;
      nextFlame += 1;
      const puffs = this.lowFx ? 1 : progress < 1 / 3 ? 3 : progress < 2 / 3 ? 2 : 1;
      for (let puff = 0; puff < puffs; puff += 1) {
        smokeChanged = this.placeSmoke(
          nextSmoke, cell, puff, progress, anchor.x, anchor.z,
        ) || smokeChanged;
        nextSmoke += 1;
      }
    }

    this.flameActive = nextFlame;
    this.smokeActive = nextSmoke;
    this.flame.count = nextFlame;
    this.smoke.count = nextSmoke;
    if (flameChanged) this.flame.instanceMatrix.needsUpdate = true;
    if (smokeChanged) this.smoke.instanceMatrix.needsUpdate = true;
  }

  stats(): TerrainFireStats {
    const pool = (mesh: InstancedMesh, capacity: number, active: number): TerrainFirePoolStats => ({
      capacity,
      active,
      mesh,
      geometry: mesh.geometry,
      material: mesh.material as Material,
      instances: mesh.instanceMatrix,
    });
    return {
      resourcePools: this.disposed ? 0 : 3,
      activeDrawCalls: this.disposed ? 0 :
        Number(this.scorch.count > 0) + Number(this.flame.count > 0) + Number(this.smoke.count > 0),
      disposed: this.disposed,
      pools: {
        flame: pool(this.flame, FIRE_CAPACITY, this.flameActive),
        smoke: pool(this.smoke, FIRE_CAPACITY * SMOKE_PER_FIRE, this.smokeActive),
        scorch: pool(this.scorch, this.scorchCapacity, this.scorchActive),
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.flameActive = 0;
    this.smokeActive = 0;
    this.scorchActive = 0;
    this.flame.count = 0;
    this.smoke.count = 0;
    this.scorch.count = 0;
    disposeObjectResources(this.group);
    this.group.clear();
  }

  private anchorForCell(cell: number): Vector3 {
    const column = cell % this.grid.width;
    const row = Math.floor(cell / this.grid.width);
    const side = visualHash(cell, 67) < 0.5 ? -1 : 1;
    return this.anchor.set(
      (column + 0.5 + side * FIRE_ANCHOR_LATERAL) * this.grid.tileSize,
      0,
      (row + FIRE_ANCHOR_NEAR) * this.grid.tileSize,
    );
  }

  private placeFlame(
    slot: number,
    cell: number,
    progress: number,
    x: number,
    z: number,
  ): boolean {
    const pulse = this.reducedMotion
      ? 1
      : 1 + Math.sin(this.elapsed * 8 + visualHash(cell, 3) * Math.PI * 2) * 0.08;
    this.position.set(x, this.heightAt(x, z) + FLAME_LIFT, z);
    this.rotation.setFromAxisAngle(UP, visualHash(cell, 5) * Math.PI);
    this.scale.set(
      this.grid.tileSize * (0.28 + visualHash(cell, 7) * 0.08) * pulse,
      this.grid.tileSize * (0.62 - progress * 0.18) * pulse,
      this.grid.tileSize * (0.28 + visualHash(cell, 11) * 0.08) * pulse,
    );
    return this.writeMatrix(
      this.flame, slot, this.matrix.compose(this.position, this.rotation, this.scale),
    );
  }

  private placeSmoke(
    slot: number,
    cell: number,
    puff: number,
    progress: number,
    anchorX: number,
    anchorZ: number,
  ): boolean {
    const phase = this.reducedMotion
      ? visualHash(cell, 31 + puff)
      : (this.elapsed * 0.16 + visualHash(cell, 31 + puff)) % 1;
    const x = anchorX
      + (visualHash(cell, 41 + puff) - 0.5) * this.grid.tileSize * 0.45;
    const z = anchorZ
      + (visualHash(cell, 47 + puff) - 0.5) * this.grid.tileSize * 0.45;
    const radius = this.grid.tileSize * (0.14 + phase * 0.11 + progress * 0.04);
    this.position.set(x, this.heightAt(x, z) + this.grid.tileSize * (0.52 + phase * 0.95), z);
    this.rotation.identity();
    this.scale.set(radius * 1.2, radius, radius * 1.2);
    return this.writeMatrix(
      this.smoke, slot, this.matrix.compose(this.position, this.rotation, this.scale),
    );
  }

  private observeBurnt(cell: number): void {
    if (this.observedScorch[cell] === 1) return;
    const slot = this.scorchSlotByCell[cell] ?? -1;
    if (slot < 0) return;
    this.observedScorch[cell] = 1;
    this.scorchActive += 1;
    const column = cell % this.grid.width;
    const row = Math.floor(cell / this.grid.width);
    const x = (column + 0.5) * this.grid.tileSize;
    const z = (row + 0.5) * this.grid.tileSize;
    this.position.set(x, this.heightAt(x, z) + 0.08, z);
    this.rotation.setFromAxisAngle(RIGHT, -Math.PI / 2);
    const radius = this.grid.tileSize * (0.38 + visualHash(cell, 61) * 0.08);
    this.scale.set(radius, radius, radius);
    this.scorch.setMatrixAt(slot, this.matrix.compose(this.position, this.rotation, this.scale));
    this.scorch.count = Math.max(this.scorch.count, slot + 1);
    this.scorch.instanceMatrix.addUpdateRange(slot * 16, 16);
    this.scorch.instanceMatrix.needsUpdate = true;
  }

  private writeMatrix(mesh: InstancedMesh, slot: number, matrix: Matrix4): boolean {
    const offset = slot * 16;
    for (let index = 0; index < 16; index += 1) {
      if (mesh.instanceMatrix.array[offset + index] !== Math.fround(matrix.elements[index] ?? 0)) {
        mesh.setMatrixAt(slot, matrix);
        return true;
      }
    }
    return false;
  }
}
