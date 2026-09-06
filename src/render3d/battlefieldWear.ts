import {
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { SimEvent } from '../sim/events';
import { tileVisible } from '../sim/sensors';
import type { Vec2, World } from '../sim/types';
import { disposeObjectResources } from './sceneResources';
import { ScarLayer } from './scarLayer';
export { ScarLayer } from './scarLayer';

const HIDDEN = new Matrix4().makeScale(0, 0, 0);
const NO_TURN = new Quaternion();
const AT = new Vector3();
const SIZE = new Vector3();
const MATRIX = new Matrix4();
const TINT = new Color();

const PUFFS = 9;
const CYCLE_SECONDS = 5.5;
const SMOKE_SECONDS = 60;
const RISE = 95;

interface SmokeColumn {
  active: boolean;
  key: number | null;
  x: number;
  z: number;
  ground: number;
  elapsed: number;
  base: number;
}

function preallocateColours(mesh: InstancedMesh, count: number): void {
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
  mesh.instanceColor.setUsage(DynamicDrawUsage);
}

/** Fixed smoke columns whose density falls away over one presentation minute. */
export class SmokeLayer {
  readonly mesh: InstancedMesh;

  private readonly columns: SmokeColumn[] = [];
  private readonly drift: Vec2;
  private readonly far: Color;
  private disposed = false;

  constructor(
    fogColour: Color,
    drift: Vec2 = { x: 26, y: -14 },
    capacity = 16,
  ) {
    this.drift = drift;
    this.far = fogColour.clone();
    const count = Math.max(0, capacity) * PUFFS;
    const material = new MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false });
    this.mesh = new InstancedMesh(new SphereGeometry(1, 7, 6), material, count);
    this.mesh.name = 'wreck-smoke';
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    preallocateColours(this.mesh, count);
    for (let slot = 0; slot < Math.max(0, capacity); slot += 1) {
      this.columns.push({
        active: false,
        key: null,
        x: 0,
        z: 0,
        ground: 0,
        elapsed: 0,
        base: slot * PUFFS,
      });
    }
    for (let instance = 0; instance < count; instance += 1) {
      this.mesh.setMatrixAt(instance, HIDDEN);
    }
  }

  get activeColumns(): number {
    let active = 0;
    for (const column of this.columns) if (column.active) active += 1;
    return active;
  }

  /** A repeated terminal event must not restart or duplicate the same wreck. */
  start(at: Vec2, ground: number, key?: number): void {
    if (this.disposed || this.columns.length === 0) return;
    if (key !== undefined) {
      for (const column of this.columns) {
        if (column.active && column.key === key) return;
      }
    }

    let chosen: SmokeColumn | undefined;
    for (const column of this.columns) {
      if (!column.active) { chosen = column; break; }
      if (chosen === undefined || column.elapsed > chosen.elapsed) chosen = column;
    }
    if (chosen === undefined) return;
    chosen.active = true;
    chosen.key = key ?? null;
    chosen.x = at.x;
    chosen.z = at.y;
    chosen.ground = ground;
    chosen.elapsed = 0;
    this.mesh.count = Math.max(this.mesh.count, chosen.base + PUFFS);
    this.drawColumn(chosen, PUFFS);
    this.commit();
  }

  update(deltaSeconds: number): void {
    if (this.disposed || this.mesh.count === 0) return;
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    if (delta === 0) return;
    let highestActive = 0;
    for (const column of this.columns) {
      if (!column.active) continue;
      column.elapsed += delta;
      if (column.elapsed >= SMOKE_SECONDS) {
        column.active = false;
        column.key = null;
        this.hideColumn(column);
        continue;
      }
      highestActive = column.base + PUFFS;
      const strength = 1 - column.elapsed / SMOKE_SECONDS;
      this.drawColumn(column, Math.ceil(PUFFS * strength));
    }
    this.mesh.count = highestActive;
    if (highestActive === 0) return;
    this.commit();
  }

  /** Follow a visible falling wreck without restarting its keyed smoke cycle. */
  followAnchors(resolve: (key: number, out: Vector3) => boolean): void {
    if (this.disposed || this.mesh.count === 0) return;
    for (const column of this.columns) {
      if (!column.active || column.key === null || !resolve(column.key, AT)) continue;
      column.x = AT.x; column.z = AT.z; column.ground = AT.y - 6;
      this.drawColumn(column, Math.ceil(PUFFS * (1 - column.elapsed / SMOKE_SECONDS)));
    }
    this.commit();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeObjectResources(this.mesh);
    this.columns.length = 0;
    this.mesh.count = 0;
  }

  private drawColumn(column: SmokeColumn, density: number): void {
    for (let puff = 0; puff < PUFFS; puff += 1) {
      const slot = column.base + puff;
      if (puff >= density) {
        this.mesh.setMatrixAt(slot, HIDDEN);
        continue;
      }
      const age = (column.elapsed + puff * CYCLE_SECONDS / PUFFS) % CYCLE_SECONDS;
      const t = age / CYCLE_SECONDS;
      AT.set(
        column.x + this.drift.x * t * t,
        column.ground + 6 + RISE * t,
        column.z + this.drift.y * t * t,
      );
      SIZE.setScalar(3.4 + 15 * t);
      this.mesh.setMatrixAt(slot, MATRIX.compose(AT, NO_TURN, SIZE));
      this.mesh.setColorAt(slot, TINT.setHex(0x4a4f54).lerp(this.far, t * t));
    }
  }

  private hideColumn(column: SmokeColumn): void {
    for (let puff = 0; puff < PUFFS; puff += 1) {
      this.mesh.setMatrixAt(column.base + puff, HIDDEN);
    }
  }

  private commit(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor !== null) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Persistent battlefield memory, kept out of the already-full event router. */
export class BattlefieldWear {
  readonly smoke: SmokeLayer;
  readonly scars = new ScarLayer();
  readonly objects: readonly [InstancedMesh, InstancedMesh];

  private disposed = false;

  constructor(fogColour: Color, private readonly heightAt: (x: number, y: number) => number) {
    this.smoke = new SmokeLayer(fogColour);
    this.objects = [this.smoke.mesh, this.scars.mesh];
  }

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    this.smoke.update(deltaSeconds);
    this.scars.update(deltaSeconds);
  }

  consumeSupport(world: World, event: SimEvent): void {
    if (this.disposed || event.type !== 'ground_impact' || event.kind !== 'artillery') return;
    const tile = world.terrain.toTile(event);
    if (!world.terrain.inBounds(tile.column, tile.row)) return;
    const cell = tile.row * world.terrain.width + tile.column;
    const canSeeImpact = world.playerTeam === null || event.team === world.playerTeam ||
      tileVisible(world.vision, cell);
    if (!canSeeImpact) return;
    if (world.terrain.idAtPoint(event) !== 'water') this.artillery(event);
  }

  wreck(key: number, at: Vec2, smokeGround: number, water = false): void {
    if (this.disposed) return;
    this.smoke.start(at, smokeGround, key);
    if (!water) this.scars.crater(at, this.heightAt(at.x, at.y), 19, 0.55);
  }

  ammo(at: Vec2, damage: number, water = false): void {
    if (this.disposed || water) return;
    this.scars.crater(
      at,
      this.heightAt(at.x, at.y),
      10 + Math.min(14, Math.max(0, damage) * 0.28),
      0.35,
    );
  }

  artillery(at: Vec2): void {
    if (this.disposed) return;
    this.scars.crater(at, this.heightAt(at.x, at.y), 18, 0.42);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.smoke.dispose();
    this.scars.dispose();
  }
}
