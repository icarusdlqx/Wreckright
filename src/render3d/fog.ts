import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage,
  Mesh, MeshBasicMaterial,
} from 'three';
import type { TerrainGrid } from '../sim/terrain';
import type { TeamVision } from '../sim/sensors';
import { disposeObjectResources } from './sceneResources';

const LIFT = 0.6;
const UNSEEN = 1;
const REMEMBERED = 0.62;
const VISIBLE = 0;
const SHROUD = new Color(0x203e42);
const CORNERS = [[0, 0], [0, 1], [1, 0], [1, 1]] as const;
const VERTICES = [...CORNERS, [0.5, 0.5]] as const;

/** Opaque unknown ground with its soft edge drawn inward, into known ground. */
export class FogLayer {
  readonly mesh: Mesh;
  private readonly across: number;
  private readonly corners: Float32Array;
  private readonly cells: Float32Array;
  private readonly colours: BufferAttribute;

  constructor(grid: TerrainGrid, heightAt: (x: number, y: number) => number) {
    this.across = grid.width + 1;
    this.corners = new Float32Array(this.across * (grid.height + 1));
    this.cells = new Float32Array(grid.width * grid.height);
    const positions = new Float32Array(this.cells.length * 5 * 3);
    const colours = new Float32Array(this.cells.length * 5 * 4);
    const coarseIndices: number[] = [];
    const featherIndices: number[] = [];
    for (let row = 0; row < grid.height; row += 1) {
      for (let column = 0; column < grid.width; column += 1) {
        const start = (row * grid.width + column) * 5;
        for (const [index, [dx, dy]] of VERTICES.entries()) {
          const x = (column + dx) * grid.tileSize;
          const y = (row + dy) * grid.tileSize;
          positions.set([x, heightAt(x, y) + LIFT, y], (start + index) * 3);
          // Broad, static atmospheric variation contains no terrain or unit data.
          const lift = 0.96 + 0.04 * Math.sin(x / 180) * Math.cos(y / 230);
          colours.set([SHROUD.r * lift, SHROUD.g * lift, SHROUD.b * lift, UNSEEN], (start + index) * 4);
        }
        for (const index of [0, 1, 2, 2, 1, 3]) coarseIndices.push(start + index);
        for (const index of [0, 1, 4, 0, 4, 2, 1, 3, 4, 2, 4, 3]) featherIndices.push(start + index);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    this.colours = new BufferAttribute(colours, 4).setUsage(DynamicDrawUsage);
    geometry.setAttribute('color', this.colours);
    geometry.setIndex([...coarseIndices, ...featherIndices]);
    geometry.setDrawRange(coarseIndices.length, featherIndices.length);
    this.mesh = new Mesh(geometry, new MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide,
    }));
    this.mesh.renderOrder = 2;
    this.mesh.name = 'fog';
  }

  /** Low FX keeps the original two-triangle tile budget without reallocating. */
  setLowFx(lowFx: boolean): void {
    const coarseCount = this.cells.length * 6;
    this.mesh.geometry.setDrawRange(lowFx ? 0 : coarseCount, lowFx ? coarseCount : coarseCount * 2);
  }

  update(grid: TerrainGrid, vision: TeamVision | null): void {
    this.mesh.visible = vision !== null;
    if (vision === null) return;
    this.corners.fill(VISIBLE);
    for (let row = 0; row < grid.height; row += 1) {
      for (let column = 0; column < grid.width; column += 1) {
        const cell = row * grid.width + column;
        const alpha = vision.tiles[cell] === 1 ? VISIBLE : vision.explored[cell] === 1 ? REMEMBERED : UNSEEN;
        this.cells[cell] = alpha;
        for (const [dx, dy] of CORNERS) {
          const corner = (row + dy) * this.across + column + dx;
          this.corners[corner] = Math.max(this.corners[corner] ?? VISIBLE, alpha);
        }
      }
    }
    // Shared corners take the most opaque neighbour. No blended fringe can
    // reveal a sliver of an unseen tile; the known tile's centre stays clear.
    const array = this.colours.array as Float32Array;
    let changed = false;
    for (let row = 0; row < grid.height; row += 1) {
      for (let column = 0; column < grid.width; column += 1) {
        const cell = row * grid.width + column;
        for (const [index, [dx, dy]] of VERTICES.entries()) {
          const alpha = index === 4 ? this.cells[cell]! : this.corners[(row + dy) * this.across + column + dx]!;
          const offset = (cell * 5 + index) * 4 + 3;
          if (array[offset] === alpha) continue;
          array[offset] = alpha; changed = true;
        }
      }
    }
    if (changed) this.colours.needsUpdate = true;
  }

  dispose(): void { disposeObjectResources(this.mesh); }
}
