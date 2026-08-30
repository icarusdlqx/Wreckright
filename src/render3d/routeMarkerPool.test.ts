import {
  BufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshBasicMaterial,
} from 'three';
import { describe, expect, it } from 'vitest';
import { RouteMarkerPool } from './routeMarkerPool';
import type { RouteMarkerView } from './routeMarkerTypes';

const route: RouteMarkerView = {
  entityId: 7,
  team: 0,
  legs: [
    {
      points: [{ x: 0, y: 0 }, { x: 48, y: 0 }],
      kind: 'active',
      run: false,
      arrivalFacing: 0,
      arrivalFacingEstimated: true,
      cumulativeEtaSeconds: 11.2,
    },
    {
      points: [{ x: 48, y: 0 }, { x: 96, y: 0 }],
      kind: 'queued',
      run: true,
      arrivalFacing: 0,
      arrivalFacingEstimated: true,
      cumulativeEtaSeconds: 29.1,
    },
  ],
};

function draw(
  pool: RouteMarkerPool,
  marker: RouteMarkerView = route,
  deltaSeconds = 0,
  reducedMotion = false,
): void {
  pool.begin(deltaSeconds, reducedMotion);
  pool.add(marker, marker.legs[0]?.points[0] ?? null, 24);
  pool.commit();
}

describe('route marker pooling', () => {
  it('uses three fixed team-colour batches for lines, marks, wedges and approximate ETA glyphs', () => {
    const pool = new RouteMarkerPool((x) => x / 10);
    draw(pool);

    expect(pool.group.name).toBe('route-markers');
    expect(pool.group.children.map((child) => child.name)).toEqual([
      'route-lines',
      'route-marks',
      'route-labels',
    ]);
    expect(pool.stats).toMatchObject({
      routes: 1,
      activeLegs: 1,
      queuedLegs: 1,
      lineSegments: 8,
      wedges: 2,
      labels: 2,
      labelTexts: ['~12s', '~30s'],
      dropped: 0,
    });
    expect(pool.stats.chevrons).toBeGreaterThan(0);

    const lines = pool.group.getObjectByName('route-lines') as LineSegments;
    const positions = lines.geometry.getAttribute('position') as BufferAttribute;
    const colours = lines.geometry.getAttribute('color') as BufferAttribute;
    expect(positions.getX(1)).toBe(12);
    expect(positions.getY(1)).toBeCloseTo(3);
    expect(positions.getX(9)).toBe(60);
    expect(positions.getY(9)).toBeCloseTo(7.8);
    const activeBrightness = colours.getX(0) + colours.getY(0) + colours.getZ(0);
    const queuedVertex = 4 * 2;
    const queuedBrightness = colours.getX(queuedVertex)
      + colours.getY(queuedVertex)
      + colours.getZ(queuedVertex);
    expect(queuedBrightness / activeBrightness).toBeCloseTo(0.38);
    expect((lines.material as LineBasicMaterial).opacity).toBe(0.9);
    expect((lines.material as LineBasicMaterial).depthTest).toBe(false);
    expect(lines.renderOrder).toBe(10);
    expect(lines.userData).toMatchObject({ activeIntensity: 1, queuedIntensity: 0.38 });

    const marks = pool.group.getObjectByName('route-marks') as InstancedMesh;
    expect(marks.count).toBe(pool.stats.chevrons + pool.stats.wedges);
    expect(marks.instanceColor).not.toBeNull();
    expect((marks.material as MeshBasicMaterial).opacity).toBe(0.92);
    expect((marks.material as MeshBasicMaterial).map).toBeNull();
    expect((marks.material as MeshBasicMaterial).depthTest).toBe(false);
    expect(marks.renderOrder).toBe(11);
    const labels = pool.group.getObjectByName('route-labels') as LineSegments;
    expect(labels.userData.approximateEta).toBe(true);
    expect(labels.geometry.drawRange.count).toBeGreaterThan(0);
    const labelPositions = labels.geometry.getAttribute('position') as BufferAttribute;
    expect(labelPositions.getX(0)).toBeGreaterThan(labelPositions.getX(1));
    pool.dispose();
  });

  it('animates chevrons from wall time and freezes them in reduced motion without rebuilding', () => {
    const pool = new RouteMarkerPool(() => 0);
    draw(pool, route, 0.1, false);
    const marks = pool.group.getObjectByName('route-marks') as InstancedMesh;
    const marksIdentity = marks;
    const geometryIdentity = marks.geometry;
    const materialIdentity = marks.material;
    const animated = new Matrix4();
    marks.getMatrixAt(pool.stats.wedges, animated);
    const firstPhase = pool.stats.phase;

    draw(pool, route, 0.2, false);
    const advanced = new Matrix4();
    marks.getMatrixAt(pool.stats.wedges, advanced);
    expect(pool.stats.phase).toBeGreaterThan(firstPhase);
    expect(advanced.elements).not.toEqual(animated.elements);

    draw(pool, route, 0.25, true);
    const frozenPhase = pool.stats.phase;
    const frozen = new Matrix4();
    marks.getMatrixAt(pool.stats.wedges, frozen);
    draw(pool, route, 0.25, true);
    const stillFrozen = new Matrix4();
    marks.getMatrixAt(pool.stats.wedges, stillFrozen);
    expect(pool.stats.phase).toBe(frozenPhase);
    expect(stillFrozen.elements).toEqual(frozen.elements);
    expect(pool.stats.chevrons).toBeGreaterThan(0);
    expect(marks.visible).toBe(true);

    draw(pool, route, 0.1, false);
    expect(pool.stats.phase).not.toBe(frozenPhase);
    expect(marks).toBe(marksIdentity);
    expect(marks.geometry).toBe(geometryIdentity);
    expect(marks.material).toBe(materialIdentity);
    pool.dispose();
  });

  it('keeps all Three resources and buffer identities stable across 1,000 redraws', () => {
    const pool = new RouteMarkerPool(() => 0);
    draw(pool);
    const children = [...pool.group.children];
    const resources = children.map((child) => {
      const drawable = child as LineSegments | InstancedMesh;
      return {
        geometry: drawable.geometry,
        material: drawable.material,
        position: drawable.geometry.getAttribute('position'),
        color: drawable.geometry.getAttribute('color'),
        instanceColor: drawable instanceof InstancedMesh ? drawable.instanceColor : null,
        instanceMatrix: drawable instanceof InstancedMesh ? drawable.instanceMatrix : null,
      };
    });

    for (let frame = 0; frame < 1_000; frame += 1) {
      draw(pool, route, 1 / 60, frame % 9 === 0);
    }
    expect(pool.group.children).toEqual(children);
    children.forEach((child, index) => {
      const drawable = child as LineSegments | InstancedMesh;
      expect(drawable.geometry).toBe(resources[index]?.geometry);
      expect(drawable.material).toBe(resources[index]?.material);
      expect(drawable.geometry.getAttribute('position')).toBe(resources[index]?.position);
      expect(drawable.geometry.getAttribute('color')).toBe(resources[index]?.color);
      if (drawable instanceof InstancedMesh) {
        expect(drawable.instanceColor).toBe(resources[index]?.instanceColor);
        expect(drawable.instanceMatrix).toBe(resources[index]?.instanceMatrix);
      }
    });
    expect(pool.stats.dropped).toBe(0);
    pool.dispose();
  });

  it('fails soft at fixed capacities instead of allocating more batches', () => {
    const pool = new RouteMarkerPool(() => 0, {
      lineSegments: 2,
      directionMarks: 1,
      labelSegments: 1,
    });
    draw(pool, {
      ...route,
      legs: [{
        ...route.legs[0]!,
        points: [{ x: 0, y: 0 }, { x: 240, y: 0 }],
      }],
    });

    expect(pool.group.children).toHaveLength(3);
    expect(pool.stats.capacities).toEqual({
      lineSegments: 2,
      directionMarks: 1,
      labelSegments: 1,
    });
    expect(pool.stats.lineSegments).toBe(2);
    expect(pool.stats.wedges).toBe(1);
    expect(pool.stats.chevrons).toBe(0);
    expect(pool.stats.labels).toBe(0);
    expect(pool.stats.dropped).toBeGreaterThan(0);
    pool.dispose();
  });
});
