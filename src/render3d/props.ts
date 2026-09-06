import {
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
} from 'three';
import type { TerrainMapData } from '../schema/map';
import type { TeamVision } from '../sim/sensors';
import type { TerrainGrid } from '../sim/terrain';
import { buildPropPlacements, type PropPlacement as Placement } from './propPlacements';
import { createPropGeometry, type PropKind } from './propGeometry';
import { disposeObjectResources } from './sceneResources';

/**
 * Ceilings per prop kind, so a map that is wall-to-wall forest cannot ask a
 * phone for ten thousand trees. When a map wants more than the ceiling the
 * placements are thinned evenly rather than truncated, so the far corner of
 * the map does not go mysteriously bald.
 */
const CAPS = {
  tree: 2_200,
  snag: 800,
  boulder: 800,
  shale: 800,
  crag: 600,
  block: 900,
  causeway: 180,
  wreckage: 300,
  relay: 3, silos: 3, gantry: 3, spire: 3,
} as const satisfies Record<PropKind, number>;

interface Batch {
  mesh: InstancedMesh;
  placements: Placement[];
  dirty: boolean;
}
const HIDDEN = new Matrix4().makeScale(0, 0, 0);

/**
 * Set dressing grown from the same tile data the simulation fights over. Each
 * ordinary detail sits inside merged geometry. At most three authored landmark
 * kinds add one bounded batch each, reusing the same fog updates. Props on
 * ground the lance has never seen are scaled away — the shroud skin hugs the
 * terrain, and a lit smokestack poking out of black fog would hand out intel.
 */
export class PropLayer {
  readonly group = new Group();
  private readonly batches: Batch[] = [];
  private exploredCount = -1;
  /**
   * The explored map as of the last reveal, so a change only touches the
   * tiles that actually flipped. Exploration in forest arrives one tile per
   * sim tick — the trees block the sightlines — and rewriting and re-uploading
   * every instance on the map twenty times a second for that is exactly the
   * kind of buffer churn that reads as "it stutters in the woods".
   */
  private revealed: Uint8Array | null = null;
  /** Instances on each tile, as [batch index, instance index] pairs. */
  private readonly tileInstances = new Map<number, [number, number][]>();
  /** Burnt ground is remembered only after an optical look at the changed tile. */
  private readonly observedBurnt: Uint8Array;
  private observedBurntCount = 0;
  constructor(
    private readonly grid: TerrainGrid,
    data: TerrainMapData,
    heightAt: (x: number, y: number) => number,
    /** The same tint the ground took, so the scenery matches the ground it is on. */
    tint: { colour: Color; strength: number } | null = null,
  ) {
    this.group.name = 'props';
    this.observedBurnt = new Uint8Array(grid.width * grid.height);
    const theme = data.propTheme ?? 'alpine';
    const pending = buildPropPlacements(grid, data, heightAt, tint);

    for (const kind of Object.keys(pending) as PropKind[]) {
      let placements = pending[kind];
      if (placements.length === 0) continue;
      if (placements.length > CAPS[kind]) {
        const stride = placements.length / CAPS[kind];
        placements = Array.from(
          { length: CAPS[kind] },
          (_, i) => placements[Math.floor(i * stride)],
        ).filter((entry): entry is Placement => entry !== undefined);
      }

      const mesh = new InstancedMesh(
        createPropGeometry(kind, theme),
        new MeshLambertMaterial({ flatShading: true, vertexColors: true }),
        placements.length,
      );
      for (let i = 0; i < placements.length; i += 1) {
        const entry = placements[i];
        if (entry === undefined) continue;
        mesh.setMatrixAt(i, entry.matrix);
        mesh.setColorAt(i, entry.colour);
      }
      mesh.instanceColor?.setUsage(DynamicDrawUsage);
      mesh.castShadow = kind !== 'snag' && kind !== 'causeway';
      mesh.receiveShadow = kind === 'block' || kind === 'wreckage';
      // The base geometry's bounding sphere says nothing about where the
      // instances are, so culling by it blanks the layer at some camera angles.
      mesh.frustumCulled = false;
      // These buffers change piecemeal all battle as ground is explored;
      // told they are static, a driver may stall revalidating each rewrite.
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.name = `props-${kind}`;

      const batchIndex = this.batches.length;
      for (let i = 0; i < placements.length; i += 1) {
        const entry = placements[i];
        if (entry === undefined) continue;
        const on = this.tileInstances.get(entry.tile);
        if (on === undefined) this.tileInstances.set(entry.tile, [[batchIndex, i]]);
        else on.push([batchIndex, i]);
      }

      this.batches.push({ mesh, placements, dirty: false });
      this.group.add(mesh);
    }
  }

  /** Hides props on unexplored tiles; exploration only ever grows, so this is
   *  a cheap count-compare almost every frame and a per-tile touch-up when it
   *  changes — never a rewrite of the whole map's scenery. */
  update(vision: TeamVision | null, terrain: TerrainGrid = this.grid): void {
    this.observeBurnt(vision, terrain);
    let count = Number.MAX_SAFE_INTEGER;
    if (vision !== null) {
      count = 0;
      for (let i = 0; i < vision.explored.length; i += 1) count += vision.explored[i] ?? 0;
    }
    if (count === this.exploredCount) return;
    this.exploredCount = count;

    // The first look, or the shroud coming off entirely: sweep everything
    // once and take the snapshot the incremental path diffs against.
    if (vision === null || this.revealed === null) {
      for (const batch of this.batches) {
        for (let i = 0; i < batch.placements.length; i += 1) {
          const entry = batch.placements[i];
          if (entry === undefined) continue;
          const shown = vision === null || vision.explored[entry.tile] === 1;
          const presented = this.observedBurnt[entry.tile] === 1 && entry.burntMatrix !== null
            ? entry.burntMatrix
            : entry.matrix;
          batch.mesh.setMatrixAt(i, shown ? presented : HIDDEN);
        }
        batch.mesh.instanceMatrix.needsUpdate = true;
      }
      this.revealed = vision === null ? null : Uint8Array.from(vision.explored);
      return;
    }

    // Since exploration only grows, the change is exactly the tiles that
    // flipped since last time — reveal their props and upload only those
    // sixteen floats apiece.
    const previous = this.revealed;
    for (let tile = 0; tile < vision.explored.length; tile += 1) {
      if (vision.explored[tile] !== 1 || previous[tile] === 1) continue;
      previous[tile] = 1;
      const instances = this.tileInstances.get(tile);
      if (instances === undefined) continue;
      for (const [batchIndex, instanceIndex] of instances) {
        const batch = this.batches[batchIndex];
        const entry = batch?.placements[instanceIndex];
        if (batch === undefined || entry === undefined) continue;
        const presented = this.observedBurnt[tile] === 1 && entry.burntMatrix !== null
          ? entry.burntMatrix
          : entry.matrix;
        batch.mesh.setMatrixAt(instanceIndex, presented);
        batch.mesh.instanceMatrix.addUpdateRange(instanceIndex * 16, 16);
        batch.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  stats(): { observedBurnt: number } { return { observedBurnt: this.observedBurntCount }; }

  private observeBurnt(vision: TeamVision | null, terrain: TerrainGrid): void {
    for (let tile = 0; tile < this.observedBurnt.length; tile += 1) {
      if (this.observedBurnt[tile] === 1) continue;
      if (vision !== null && vision.tiles[tile] !== 1) continue;
      const column = tile % terrain.width;
      const row = Math.floor(tile / terrain.width);
      if (terrain.idAt(column, row) !== 'burnt_forest') continue;
      this.observedBurnt[tile] = 1;
      this.observedBurntCount += 1;
      for (const [batchIndex, instanceIndex] of this.tileInstances.get(tile) ?? []) {
        const batch = this.batches[batchIndex];
        const entry = batch?.placements[instanceIndex];
        if (batch === undefined || entry === undefined || entry.burntMatrix === null) continue;
        batch.mesh.setMatrixAt(instanceIndex, entry.burntMatrix);
        if (entry.burntColour !== null) batch.mesh.setColorAt(instanceIndex, entry.burntColour);
        batch.mesh.instanceMatrix.addUpdateRange(instanceIndex * 16, 16);
        if (batch.mesh.instanceColor !== null) {
          batch.mesh.instanceColor.addUpdateRange(instanceIndex * 3, 3);
        }
        batch.dirty = true;
      }
    }
    for (const batch of this.batches) {
      if (!batch.dirty) continue;
      batch.dirty = false;
      batch.mesh.instanceMatrix.needsUpdate = true;
      if (batch.mesh.instanceColor !== null) batch.mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    disposeObjectResources(this.group);
    this.group.clear();
    this.batches.length = 0;
    this.tileInstances.clear();
    this.revealed = null;
    this.observedBurnt.fill(0);
    this.observedBurntCount = 0;
  }
}
