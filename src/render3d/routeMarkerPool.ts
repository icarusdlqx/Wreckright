import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage,
  Group, InstancedBufferAttribute, InstancedMesh, LineBasicMaterial,
  LineSegments, Matrix4, MeshBasicMaterial, Quaternion, Vector3,
} from 'three';
import { teamColour } from '../render/palette';
import type { Vec2 } from '../sim/types';
import {
  approximateEtaText, DIGIT_MASKS, GLYPH_ADVANCE, GLYPH_SCALE,
  GLYPH_SEGMENTS, glyphSegmentCount, routeLineMaterial,
  type RouteMarkerCapacities,
  type RouteMarkerStats,
} from './routeMarkerPoolSupport';
import type { RouteMarkerLeg, RouteMarkerView } from './routeMarkerTypes';
export type { RouteMarkerCapacities, RouteMarkerStats } from './routeMarkerPoolSupport';
const DEFAULT_CAPACITIES: RouteMarkerCapacities = {
  lineSegments: 1536,
  directionMarks: 512,
  labelSegments: 768,
};
const ROUTE_LIFT = 1.8;
const LABEL_LIFT = 3.5;
const CHEVRON_SPACING = 18;
const CHEVRON_SPEED = 16;
const ACTIVE_INTENSITY = 1;
const QUEUED_INTENSITY = 0.38;
/** Three fixed draw batches for all selected-unit route presentation. */
export class RouteMarkerPool {
  readonly group = new Group();
  readonly capacities: RouteMarkerCapacities;

  private readonly linePositions: BufferAttribute;
  private readonly lineColours: BufferAttribute;
  private readonly lines: LineSegments;
  private readonly markColours: InstancedBufferAttribute;
  private readonly marks: InstancedMesh;
  private readonly labelPositions: BufferAttribute;
  private readonly labelColours: BufferAttribute;
  private readonly labels: LineSegments;
  private readonly scratchColour = new Color();
  private readonly scratchMatrix = new Matrix4();
  private readonly scratchPosition = new Vector3();
  private readonly scratchRotation = new Quaternion();
  private readonly scratchScale = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private lineCount = 0;
  private markCount = 0;
  private labelSegmentCount = 0;
  private routes = 0;
  private activeLegs = 0;
  private queuedLegs = 0;
  private chevrons = 0;
  private wedges = 0;
  private labelCount = 0;
  private readonly labelTexts: string[] = [];
  private dropped = 0;
  private phase = 0;
  constructor(
    private readonly heightAt: (x: number, y: number) => number,
    capacities: Partial<RouteMarkerCapacities> = {},
  ) {
    this.capacities = Object.freeze({ ...DEFAULT_CAPACITIES, ...capacities });
    this.group.name = 'route-markers';

    const lineGeometry = new BufferGeometry();
    this.linePositions = dynamicAttribute(this.capacities.lineSegments * 2 * 3);
    this.lineColours = dynamicAttribute(this.capacities.lineSegments * 2 * 3);
    lineGeometry.setAttribute('position', this.linePositions);
    lineGeometry.setAttribute('color', this.lineColours);
    this.lines = new LineSegments(lineGeometry, routeLineMaterial(0.9, false));
    this.lines.name = 'route-lines';
    this.lines.userData.activeIntensity = ACTIVE_INTENSITY;
    this.lines.userData.queuedIntensity = QUEUED_INTENSITY;
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;

    const markGeometry = new BufferGeometry();
    markGeometry.setAttribute('position', new BufferAttribute(new Float32Array([
      1, 0, 0, -1, 0, 0.66, -0.28, 0, 0,
      1, 0, 0, -0.28, 0, 0, -1, 0, -0.66,
    ]), 3));
    this.marks = new InstancedMesh(
      markGeometry,
      new MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        depthTest: false,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      }),
      this.capacities.directionMarks,
    );
    this.markColours = dynamicInstancedAttribute(this.capacities.directionMarks * 3);
    this.marks.instanceColor = this.markColours;
    this.marks.instanceMatrix.setUsage(DynamicDrawUsage);
    this.marks.name = 'route-marks';
    this.marks.userData.activeIntensity = ACTIVE_INTENSITY;
    this.marks.userData.queuedIntensity = QUEUED_INTENSITY;
    this.marks.frustumCulled = false;
    this.marks.renderOrder = 11;
    this.marks.count = 0;

    const labelGeometry = new BufferGeometry();
    this.labelPositions = dynamicAttribute(this.capacities.labelSegments * 2 * 3);
    this.labelColours = dynamicAttribute(this.capacities.labelSegments * 2 * 3);
    labelGeometry.setAttribute('position', this.labelPositions);
    labelGeometry.setAttribute('color', this.labelColours);
    this.labels = new LineSegments(labelGeometry, routeLineMaterial(1, false));
    this.labels.name = 'route-labels';
    this.labels.userData.activeIntensity = ACTIVE_INTENSITY;
    this.labels.userData.queuedIntensity = QUEUED_INTENSITY;
    this.labels.userData.approximateEta = true;
    this.labels.frustumCulled = false;
    this.labels.renderOrder = 12;

    this.group.add(this.lines, this.marks, this.labels);
    this.group.visible = false;
  }

  begin(deltaSeconds: number, reducedMotion: boolean): void {
    this.lineCount = 0;
    this.markCount = 0;
    this.labelSegmentCount = 0;
    this.routes = 0;
    this.activeLegs = 0;
    this.queuedLegs = 0;
    this.chevrons = 0;
    this.wedges = 0;
    this.labelCount = 0;
    this.labelTexts.length = 0;
    this.dropped = 0;
    if (!reducedMotion && Number.isFinite(deltaSeconds)) {
      const safeDelta = Math.max(0, Math.min(deltaSeconds, 0.25));
      this.phase = (this.phase + safeDelta * CHEVRON_SPEED) % CHEVRON_SPACING;
    }
  }

  add(route: RouteMarkerView, liveStart: Vec2 | null, tileSize: number): void {
    this.routes += 1;
    for (let index = 0; index < route.legs.length; index += 1) {
      const leg = route.legs[index];
      if (leg === undefined || leg.points.length === 0) continue;
      if (leg.kind === 'active') this.activeLegs += 1;
      else this.queuedLegs += 1;
      const start = index === 0 ? liveStart : null;
      this.addLine(leg, start, tileSize, route.team);
      this.addWedge(leg, route.team);
      this.addChevrons(leg, start, route.team);
      this.addEta(leg, route.team);
    }
  }

  commit(): void {
    this.lines.geometry.setDrawRange(0, this.lineCount * 2);
    this.labels.geometry.setDrawRange(0, this.labelSegmentCount * 2);
    this.marks.count = this.markCount;
    this.linePositions.needsUpdate = true;
    this.lineColours.needsUpdate = true;
    this.labelPositions.needsUpdate = true;
    this.labelColours.needsUpdate = true;
    this.marks.instanceMatrix.needsUpdate = true;
    this.markColours.needsUpdate = true;
    this.lines.visible = this.lineCount > 0;
    this.marks.visible = this.markCount > 0;
    this.labels.visible = this.labelSegmentCount > 0;
    this.group.visible = this.routes > 0;
  }

  get stats(): RouteMarkerStats {
    return {
      routes: this.routes,
      activeLegs: this.activeLegs,
      queuedLegs: this.queuedLegs,
      lineSegments: this.lineCount,
      chevrons: this.chevrons,
      wedges: this.wedges,
      labels: this.labelCount,
      labelTexts: this.labelTexts.slice(),
      dropped: this.dropped,
      phase: this.phase,
      capacities: this.capacities,
    };
  }

  dispose(): void {
    this.lines.geometry.dispose();
    (this.lines.material as LineBasicMaterial).dispose();
    this.marks.geometry.dispose();
    (this.marks.material as MeshBasicMaterial).dispose();
    this.marks.dispose();
    this.labels.geometry.dispose();
    (this.labels.material as LineBasicMaterial).dispose();
  }

  private addLine(leg: RouteMarkerLeg, liveStart: Vec2 | null, tileSize: number, team: number): void {
    if (leg.points.length < 2) return;
    let ax = liveStart?.x ?? leg.points[0]?.x ?? 0;
    let ay = liveStart?.y ?? leg.points[0]?.y ?? 0;
    const maxSpan = Math.max(1, tileSize / 2);
    for (let index = 1; index < leg.points.length; index += 1) {
      const point = leg.points[index];
      if (point === undefined) continue;
      const dx = point.x - ax;
      const dy = point.y - ay;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / maxSpan));
      for (let step = 0; step < steps; step += 1) {
        const from = step / steps;
        const to = (step + 1) / steps;
        this.writeLine(
          ax + dx * from, ay + dy * from,
          ax + dx * to, ay + dy * to,
          team, leg.kind,
        );
      }
      ax = point.x;
      ay = point.y;
    }
  }

  private writeLine(
    ax: number, ay: number, bx: number, by: number,
    team: number, kind: RouteMarkerLeg['kind'],
  ): void {
    if (this.lineCount >= this.capacities.lineSegments) {
      this.dropped += 1;
      return;
    }
    const vertex = this.lineCount * 2;
    this.linePositions.setXYZ(vertex, ax, this.heightAt(ax, ay) + ROUTE_LIFT, ay);
    this.linePositions.setXYZ(vertex + 1, bx, this.heightAt(bx, by) + ROUTE_LIFT, by);
    this.setColour(this.lineColours, vertex, team, kind);
    this.setColour(this.lineColours, vertex + 1, team, kind);
    this.lineCount += 1;
  }

  private addWedge(leg: RouteMarkerLeg, team: number): void {
    const endpoint = leg.points[leg.points.length - 1];
    if (endpoint === undefined) return;
    this.writeMark(endpoint.x, endpoint.y, leg.arrivalFacing, 7.5, team, leg.kind, 'wedge');
  }

  private addChevrons(leg: RouteMarkerLeg, liveStart: Vec2 | null, team: number): void {
    if (leg.points.length < 2) return;
    let ax = liveStart?.x ?? leg.points[0]?.x ?? 0;
    let ay = liveStart?.y ?? leg.points[0]?.y ?? 0;
    let traversed = 0;
    let target = this.phase > 0.001 ? this.phase : CHEVRON_SPACING;
    const before = this.chevrons;
    for (let index = 1; index < leg.points.length; index += 1) {
      const point = leg.points[index];
      if (point === undefined) continue;
      const dx = point.x - ax;
      const dy = point.y - ay;
      const distance = Math.hypot(dx, dy);
      while (distance > 0 && target <= traversed + distance) {
        const t = (target - traversed) / distance;
        this.writeMark(ax + dx * t, ay + dy * t, Math.atan2(dy, dx), 4.6, team, leg.kind, 'chevron');
        target += CHEVRON_SPACING;
      }
      traversed += distance;
      ax = point.x;
      ay = point.y;
    }
    if (this.chevrons === before && traversed > 0) {
      this.addMidpointChevron(leg, liveStart, team, traversed);
    }
  }

  private addMidpointChevron(
    leg: RouteMarkerLeg, liveStart: Vec2 | null, team: number, routeLength: number,
  ): void {
    let ax = liveStart?.x ?? leg.points[0]?.x ?? 0;
    let ay = liveStart?.y ?? leg.points[0]?.y ?? 0;
    let traversed = 0;
    for (let index = 1; index < leg.points.length; index += 1) {
      const point = leg.points[index];
      if (point === undefined) continue;
      const dx = point.x - ax;
      const dy = point.y - ay;
      const distance = Math.hypot(dx, dy);
      if (traversed + distance >= routeLength / 2) {
        const t = (routeLength / 2 - traversed) / Math.max(distance, 0.001);
        this.writeMark(ax + dx * t, ay + dy * t, Math.atan2(dy, dx), 4.6, team, leg.kind, 'chevron');
        return;
      }
      traversed += distance;
      ax = point.x;
      ay = point.y;
    }
  }

  private writeMark(
    x: number, y: number, heading: number, scale: number, team: number,
    kind: RouteMarkerLeg['kind'], marker: 'chevron' | 'wedge',
  ): void {
    if (this.markCount >= this.capacities.directionMarks) {
      this.dropped += 1;
      return;
    }
    this.scratchPosition.set(x, this.heightAt(x, y) + ROUTE_LIFT + 0.1, y);
    this.scratchRotation.setFromAxisAngle(this.up, -heading);
    this.scratchScale.set(scale, 1, scale);
    this.scratchMatrix.compose(this.scratchPosition, this.scratchRotation, this.scratchScale);
    this.marks.setMatrixAt(this.markCount, this.scratchMatrix);
    this.setColour(this.markColours, this.markCount, team, kind);
    this.markCount += 1;
    if (marker === 'chevron') this.chevrons += 1;
    else this.wedges += 1;
  }

  private addEta(leg: RouteMarkerLeg, team: number): void {
    if (leg.cumulativeEtaSeconds === null || !Number.isFinite(leg.cumulativeEtaSeconds)) return;
    const endpoint = leg.points[leg.points.length - 1];
    if (endpoint === undefined) return;
    const text = approximateEtaText(leg.cumulativeEtaSeconds);
    let required = 0;
    for (const character of text) required += glyphSegmentCount(character);
    if (this.labelSegmentCount + required > this.capacities.labelSegments) {
      this.dropped += 1;
      return;
    }
    // The fixed camera looks north from the south, so increasing world X runs
    // right-to-left on screen. Lay the vector text backwards in world space
    // so its reading order and each glyph remain conventional to the player.
    const startX = endpoint.x + ((text.length - 1) * GLYPH_ADVANCE + 3) * GLYPH_SCALE / 2;
    const baseline = this.heightAt(endpoint.x, endpoint.y) + LABEL_LIFT;
    for (let index = 0; index < text.length; index += 1) {
      this.writeGlyph(text[index] ?? '', startX - index * GLYPH_ADVANCE * GLYPH_SCALE,
        baseline, endpoint.y, team, leg.kind);
    }
    this.labelCount += 1;
    this.labelTexts.push(text);
  }

  private writeGlyph(
    character: string, x: number, height: number, y: number,
    team: number, kind: RouteMarkerLeg['kind'],
  ): void {
    if (character === '~') {
      this.writeGlyphStroke(x, height, y, 0, 2.7, 1.2, 3.2, team, kind);
      this.writeGlyphStroke(x, height, y, 1.2, 3.2, 3, 2.7, team, kind);
      return;
    }
    const digit = character === 's' ? 5 : Number.parseInt(character, 10);
    const mask = DIGIT_MASKS[digit] ?? 0;
    for (let segment = 0; segment < 7; segment += 1) {
      if ((mask & (1 << segment)) === 0) continue;
      const offset = segment * 4;
      this.writeGlyphStroke(
        x, height, y, GLYPH_SEGMENTS[offset] ?? 0, GLYPH_SEGMENTS[offset + 1] ?? 0,
        GLYPH_SEGMENTS[offset + 2] ?? 0, GLYPH_SEGMENTS[offset + 3] ?? 0, team, kind,
      );
    }
  }

  private writeGlyphStroke(
    x: number, height: number, y: number, ax: number, ay: number, bx: number, by: number,
    team: number, kind: RouteMarkerLeg['kind'],
  ): void {
    const vertex = this.labelSegmentCount * 2;
    this.labelPositions.setXYZ(vertex, x - ax * GLYPH_SCALE, height, y + ay * GLYPH_SCALE);
    this.labelPositions.setXYZ(vertex + 1, x - bx * GLYPH_SCALE, height, y + by * GLYPH_SCALE);
    this.setColour(this.labelColours, vertex, team, kind);
    this.setColour(this.labelColours, vertex + 1, team, kind);
    this.labelSegmentCount += 1;
  }

  private setColour(
    attribute: BufferAttribute | InstancedBufferAttribute,
    index: number,
    team: number,
    kind: RouteMarkerLeg['kind'],
  ): void {
    this.scratchColour.setHex(teamColour(team));
    this.scratchColour.multiplyScalar(kind === 'active' ? ACTIVE_INTENSITY : QUEUED_INTENSITY);
    attribute.setXYZ(index, this.scratchColour.r, this.scratchColour.g, this.scratchColour.b);
  }
}

function dynamicAttribute(length: number): BufferAttribute {
  const attribute = new BufferAttribute(new Float32Array(length), 3);
  attribute.setUsage(DynamicDrawUsage);
  return attribute;
}

function dynamicInstancedAttribute(length: number): InstancedBufferAttribute {
  const attribute = new InstancedBufferAttribute(new Float32Array(length), 3);
  attribute.setUsage(DynamicDrawUsage);
  return attribute;
}
