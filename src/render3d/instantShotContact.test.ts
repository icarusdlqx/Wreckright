import { InstancedMesh, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { TracerLayer } from './tracers';
import { InstantShotPool, type InstantShotStyle } from './shotPools';

function at(mesh: InstancedMesh, index: number, local = new Vector3()): Vector3 {
  const matrix = new Matrix4(); mesh.getMatrixAt(index, matrix);
  return local.clone().applyMatrix4(matrix);
}
const engagement = { shooterId: 1, targetId: 2, weaponId: 'test-energy' };

describe('instant fire resolved contact', () => {
  it('joins the original muzzle to the component surface, copying the endpoint', () => {
    const layer = new TracerLayer(); const from = new Vector3(10, 17, 30);
    const endpoint = new Vector3(82, 38, 70);
    try {
      layer.fire(from, { x: 100, y: 80 }, { style: 'beam', colour: '#ffffff', width: 2, arc: 0 },
        1, null, 0xffffff, () => 0, engagement);
      expect(layer.resolveProjectile(engagement, endpoint)).toBe(true);
      const beam = layer.group.getObjectByName('shot-beam') as InstancedMesh;
      expect(at(beam, 0, new Vector3(0, -.5, 0)).distanceTo(from)).toBeLessThan(.001);
      expect(at(beam, 0, new Vector3(0, .5, 0)).distanceTo(endpoint)).toBeLessThan(.001);
      endpoint.set(900, 900, 900); layer.update(.05);
      expect(at(beam, 0, new Vector3(0, .5, 0)).distanceTo(new Vector3(82, 38, 70))).toBeLessThan(.001);
    } finally { layer.dispose(); }
  });

  it('matches one oldest unresolved engagement without stealing another beam or restarting its fade', () => {
    const pool = new InstantShotPool('beam', 3, 1);
    pool.spawn(new Vector3(), 100, 14, 0, 0xffffff, 1, .22, 1, engagement);
    pool.spawn(new Vector3(), 110, 14, 0, 0xffffff, 1, .22, 1, { ...engagement, shooterId: 3 });
    pool.spawn(new Vector3(), 120, 14, 0, 0xffffff, 1, .22, 1, engagement);
    pool.update(.1);
    expect(pool.resolve(engagement, new Vector3(80, 35, 20))).toBe(true);
    expect(at(pool.mesh, 0, new Vector3(0, .5, 0)).y).toBeCloseTo(35);
    expect(at(pool.mesh, 1, new Vector3(0, .5, 0)).y).toBeCloseTo(14);
    expect(at(pool.mesh, 2, new Vector3(0, .5, 0)).y).toBeCloseTo(14);
    expect(pool.resolve(engagement, new Vector3(85, 40, 20))).toBe(true);
    expect(pool.resolve(engagement, new Vector3())).toBe(false);
    pool.update(.12); expect(pool.snapshot().active).toBe(0);
  });

  it.each(['beam', 'pulse', 'bolt', 'flame'] as InstantShotStyle[])(
    'updates the %s path without changing fixed storage or capacity', (style) => {
      const pool = new InstantShotPool(style, 2, style === 'beam' ? 1 : 5);
      const geometry = pool.mesh.geometry, matrix = pool.mesh.instanceMatrix;
      pool.spawn(new Vector3(), 100, 14, 0, 0xffffff, 1, .3, 1, engagement);
      const before = at(pool.mesh, 0);
      expect(pool.resolve(engagement, new Vector3(40, 50, 20))).toBe(true);
      expect(at(pool.mesh, 0).distanceTo(before)).toBeGreaterThan(1);
      expect(pool.mesh.geometry).toBe(geometry); expect(pool.mesh.instanceMatrix).toBe(matrix);
      expect(pool.snapshot()).toMatchObject({ active: 1, capacity: 2 });
    });

  it('keeps the essential Low FX beam aligned to the same contact', () => {
    const layer = new TracerLayer(); layer.setPresentationMode(true, true);
    try {
      layer.fire(new Vector3(), { x: 100, y: 0 }, { style: 'beam', colour: '#ffffff', width: 2, arc: 0 },
        1, null, 0xffffff, () => 0, engagement);
      layer.resolveProjectile(engagement, new Vector3(80, 30, 20));
      const beam = layer.group.getObjectByName('shot-beam') as InstancedMesh;
      expect(at(beam, 0, new Vector3(0, .5, 0)).y).toBeCloseTo(30);
      layer.update(.14); expect(layer.stats().active).toBe(0);
    } finally { layer.dispose(); }
  });
});
