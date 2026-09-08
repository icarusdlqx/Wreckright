import { MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { weaponCylinder } from './weaponGeometry';

describe('machined weapon geometry', () => {
  it('leaves a real recessed muzzle throat instead of a flat black disc', () => {
    const material = new MeshStandardMaterial();
    const mesh = weaponCylinder('field-muzzle-collar', 2, 2, 1, [0, 0, 0], material, 'tactical');
    const positions = mesh.geometry.getAttribute('position');
    let frontMinimumRadius = Infinity;
    let innerRear = false;
    for (let index = 0; index < positions.count; index += 1) {
      const radius = Math.hypot(positions.getX(index), positions.getZ(index));
      if (positions.getY(index) > 0.49) frontMinimumRadius = Math.min(frontMinimumRadius, radius);
      if (positions.getY(index) < 0 && radius < 1.3 && radius > 1.1) innerRear = true;
    }
    expect(frontMinimumRadius).toBeCloseTo(1.24);
    expect(innerRear).toBe(true);
    mesh.geometry.dispose(); material.dispose();
  });

  it('builds barrel reinforcing collars into the original mesh and keeps its firing extent', () => {
    const material = new MeshStandardMaterial();
    const mesh = weaponCylinder('siege-barrel', 2, 1.7, 12, [2, 0, 0], material, 'tactical');
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox!;
    expect(bounds.max.y).toBe(6);
    expect(bounds.min.y).toBe(-6);
    expect(bounds.max.x).toBeGreaterThan(2);
    expect(mesh.children).toHaveLength(0);
    expect(mesh.rotation.z).toBe(-Math.PI / 2);
    mesh.geometry.dispose(); material.dispose();
  });
});
