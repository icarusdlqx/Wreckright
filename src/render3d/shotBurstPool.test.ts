import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ShotBurstPool } from './shotBurstPool';
import { burstFamilyOf, burstProfile } from './shotBurstProfiles';

function scaleAt(pool: ShotBurstPool, index: number): number {
  const matrix = new Matrix4();
  pool.mesh.getMatrixAt(index, matrix);
  return new Vector3().setFromMatrixScale(matrix).x;
}

function positionAt(pool: ShotBurstPool, index: number): Vector3 {
  const matrix = new Matrix4();
  pool.mesh.getMatrixAt(index, matrix);
  return new Vector3().setFromMatrixPosition(matrix);
}

function visibleInstances(pool: ShotBurstPool): number {
  let visible = 0;
  for (let index = 0; index < pool.mesh.count; index += 1) {
    if (scaleAt(pool, index) > 1e-6) visible += 1;
  }
  return visible;
}

describe('impact bursts by weapon family', () => {
  it('maps every authored style onto an impact family', () => {
    expect(burstFamilyOf('beam')).toBe('energy');
    expect(burstFamilyOf('pulse')).toBe('energy');
    expect(burstFamilyOf('bolt')).toBe('arc');
    expect(burstFamilyOf('flame')).toBe('flame');
    expect(burstFamilyOf('tracer')).toBe('kinetic');
    expect(burstFamilyOf('slug')).toBe('kinetic');
    expect(burstFamilyOf('burst')).toBe('kinetic');
    expect(burstFamilyOf('missile')).toBe('missile');
    expect(burstFamilyOf(undefined)).toBe('generic');
  });

  it('keeps a miss quieter than a hit in every family', () => {
    for (const family of ['energy', 'arc', 'flame', 'kinetic', 'missile', 'generic'] as const) {
      const hit = burstProfile('hit', family);
      const miss = burstProfile('miss', family);
      expect(miss.particles).toBeLessThanOrEqual(hit.particles);
      expect(miss.opacity).toBeLessThanOrEqual(hit.opacity);
    }
  });

  it('draws an energy splash as a glow core with few sparks and a kinetic hit as many falling sparks', () => {
    const energy = new ShotBurstPool(4);
    const kinetic = new ShotBurstPool(4);
    energy.spawn({ x: 0, y: 0 }, 0, 'hit', 0xffffff, 1, 1, 1, 'energy');
    kinetic.spawn({ x: 0, y: 0 }, 0, 'hit', 0xffffff, 1, 1, 1, 'kinetic');

    expect(visibleInstances(energy)).toBe(3);
    expect(visibleInstances(kinetic)).toBe(8);
    expect(scaleAt(energy, 0)).toBeGreaterThan(scaleAt(energy, 1) * 1.5);

    kinetic.update(0.3);
    energy.update(0.2);
    // Kinetic sparks have started dropping back toward the ground by late life.
    const kineticSparkHeight = positionAt(kinetic, 7).y;
    const kineticRise = burstProfile('hit', 'kinetic');
    expect(kineticSparkHeight).toBeLessThan(14 + kineticRise.rise * kineticRise.life);
    // The energy core is gone well before its sparks.
    const colours = energy.mesh.instanceColor;
    expect(colours).not.toBeNull();
    if (colours === null) return;
    expect(colours.getX(0)).toBe(0);
    expect(colours.getX(1)).toBeGreaterThan(0);
  });

  it('holds a delayed burst unseen until its travelling round can arrive', () => {
    const pool = new ShotBurstPool(4);
    pool.spawn({ x: 10, y: 20 }, 0, 'hit', 0xffffff, 1, 1, 1, 'arc', 0.2);
    expect(visibleInstances(pool)).toBe(0);
    expect(pool.snapshot().active).toBe(1);
    pool.update(0.1);
    expect(visibleInstances(pool)).toBe(0);
    pool.update(0.15);
    expect(visibleInstances(pool)).toBeGreaterThan(0);
    pool.update(1);
    expect(pool.snapshot().active).toBe(0);
  });

  it('keeps generic explosion kinds exactly as before', () => {
    expect(burstProfile('terminal', 'generic').particles).toBe(8);
    expect(burstProfile('ammo', 'generic').particles).toBe(5);
    expect(burstProfile('critical', 'generic').core).toBe(0);
    expect(burstProfile('shell', 'generic').rise).toBeGreaterThan(burstProfile('terminal', 'generic').rise);
  });
});
