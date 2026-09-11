import { describe, expect, it, vi } from 'vitest';
import { BufferGeometry } from 'three';
import { catalog } from '../../../tests/support';
import { chassisBlueprint } from '../../render/blueprint';
import { armoured } from '../../render/blueprint/parts';
import * as geometry from '../../render3d/mechGeometry';
import { projectAnatomyPart, projectChassisAnatomy } from './anatomyProjection';

const minimumY = (piece: ReturnType<typeof projectAnatomyPart>) => Math.min(...piece.points.map(point => point.y));

describe('anatomical chassis projection', () => {
  it('places the right arm on screen-left and applies the same torso lift and pitch as the model', () => {
    const arm = armoured('right_arm', [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]],
      [0, 3, 2], [4, 2, 1], 'plate', {});
    const plain = projectAnatomyPart(arm, 5);
    expect(plain.points.every(point => point.x < 0)).toBe(true);
    expect(minimumY(plain)).toBeCloseTo(-9);
    expect(minimumY(projectAnatomyPart({ ...arm, tilt: Math.PI / 2 }, 5))).toBeCloseTo(-10);
    expect(minimumY(projectAnatomyPart({ ...arm, fixed: true }, 5))).toBeCloseTo(-4);
    expect(minimumY(projectAnatomyPart({ ...arm, location: 'right_leg' }, 5))).toBeCloseTo(-4);
  });

  it('derives a distinct in-bounds elevation for every walker and releases temporary geometry', () => {
    const dispose = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const build = vi.spyOn(geometry, 'geometryForBlueprintPart');
    const outlines = new Set<string>();
    let expectedParts = 0;
    try {
      const walkers = [...catalog.chassis.values()].filter(chassis =>
        !['tracked', 'wheeled', 'emplacement'].includes(chassis.silhouette.form));
      expect(walkers).toHaveLength(16);
      for (const chassis of walkers) {
        const plan = chassisBlueprint(chassis.silhouette, chassis.traits, chassis.hardpoints, chassis.id);
        const structure = plan.parts.filter(part => part.detail === 'structure');
        const elevation = projectChassisAnatomy(chassis);
        expectedParts += structure.length;
        expect(elevation.pieces).toHaveLength(structure.length);
        expect(new Set(elevation.pieces.map(piece => piece.location))).toEqual(new Set(structure.map(part => part.location)));
        const [x, y, width, height] = elevation.viewBox.split(' ').map(Number) as [number, number, number, number];
        for (const piece of elevation.pieces) {
          expect(piece.points.length).toBeGreaterThanOrEqual(3);
          for (const point of piece.points) {
            expect(point.x).toBeGreaterThan(x);
            expect(point.x).toBeLessThan(x + width);
            expect(point.y).toBeGreaterThan(y);
            expect(point.y).toBeLessThan(y + height);
          }
        }
        outlines.add(JSON.stringify(elevation));
      }
      expect(outlines.size).toBe(16);
      expect(build).toHaveBeenCalledTimes(expectedParts);
      for (const result of build.mock.results) {
        expect(result.type).toBe('return');
        expect(dispose.mock.contexts.filter(context => context === result.value)).toHaveLength(1);
      }
    } finally { dispose.mockRestore(); build.mockRestore(); }
  });
});
