import { InstancedMesh, MeshStandardMaterial, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { testWorld, unitOf } from '../../tests/support';
import { HeatVentPool } from './heatVentPool';
import { UnitViews } from './unitViews';

function ventMesh(scene: Scene): InstancedMesh {
  const mesh = scene.getObjectByName('heat-vents');
  if (!(mesh instanceof InstancedMesh)) throw new Error('no vent pool in scene');
  return mesh;
}

describe('reactor heat presentation', () => {
  it('keeps a fixed vent budget and recycles the oldest puff', () => {
    const pool = new HeatVentPool(4);
    for (let index = 0; index < 9; index += 1) pool.spawn(index, 10, 0, index, 2);
    expect(pool.active).toBe(4);
    pool.update(0.5);
    expect(pool.active).toBe(4);
    pool.update(0.5);
    expect(pool.active).toBe(0);
    pool.dispose();
  });

  it('vents steam only above half heat, faster as the reactor climbs', () => {
    const world = testWorld('heat-vent');
    const entity = unitOf(world, 'sentinel_brawler');
    const scene = new Scene();
    const units = new UnitViews(scene, () => 0);
    units.viewFor(world, entity);
    units.beginFrame(0);
    units.markPlaced(entity.id);
    const vents = ventMesh(scene);
    const puffs = () => {
      let count = 0;
      for (let index = 0; index < vents.count; index += 1) {
        const matrix = new Float32Array(16);
        vents.instanceMatrix.array.slice(index * 16, index * 16 + 16).forEach((value, at) => {
          matrix[at] = value;
        });
        if (matrix[0] !== 0) count += 1;
      }
      return count;
    };

    entity.heat = entity.heatCapacity * 0.3;
    units.presentHeat(entity, 1);
    expect(puffs()).toBe(0);

    entity.heat = entity.heatCapacity * 0.6;
    units.presentHeat(entity, 1);
    const warm = puffs();
    expect(warm).toBeGreaterThan(0);

    units.beginFrame(2);
    units.markPlaced(entity.id);
    entity.heat = entity.heatCapacity * 0.95;
    units.presentHeat(entity, 1);
    expect(puffs()).toBeGreaterThan(warm);
    units.dispose();
  });

  it('glows the torso shell only past the shutdown band and skips steam in low-FX', () => {
    const world = testWorld('heat-glow');
    const entity = unitOf(world, 'sentinel_brawler');
    const scene = new Scene();
    const units = new UnitViews(scene, () => 0);
    const view = units.viewFor(world, entity);
    units.setRenderQuality(300, true);
    units.beginFrame(0);
    units.markPlaced(entity.id);
    const torso = view.anchors.centre_torso?.[0];
    const before = torso?.material;

    entity.heat = entity.heatCapacity * 0.7;
    units.presentHeat(entity, 1);
    expect(torso?.material).toBe(before);
    expect(view.surface.heatGlow).toBe(0);

    entity.heat = entity.heatCapacity * 0.95;
    units.presentHeat(entity, 1);
    units.beginFrame(0.016);
    expect(view.surface.heatGlow).toBeGreaterThan(0.5);
    expect(torso?.material).not.toBe(before);
    expect((torso?.material as MeshStandardMaterial).emissive.r).toBeGreaterThan(0);
    // Low-FX keeps the cheap glow but never spends a steam puff.
    let puffs = 0;
    const vents = ventMesh(scene);
    for (let index = 0; index < vents.count; index += 1) {
      if (vents.instanceMatrix.array[index * 16] !== 0) puffs += 1;
    }
    expect(puffs).toBe(0);
    units.dispose();
  });
});
