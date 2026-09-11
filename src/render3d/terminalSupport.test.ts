import { Mesh, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { catalog, spawnDesign, testWorld } from '../../tests/support';
import type { BattleEffects } from './battleEffects';
import { Locomotion } from './locomotion';
import { buildMechModel, disposeModel, type MechModel } from './mechModel';

function minimumClearance(model: MechModel, terrain: (x: number, z: number) => number): number {
  model.root.updateWorldMatrix(true, true);
  const point = new Vector3();
  let minimum = Infinity;
  model.root.traverse((mesh) => {
    if (!(mesh instanceof Mesh) || mesh.userData.blueprintDetail !== 'structure') return;
    const vertices = mesh.geometry.getAttribute('position');
    for (let index = 0; index < vertices.count; index += 1) {
      point.fromBufferAttribute(vertices, index).applyMatrix4(mesh.matrixWorld);
      minimum = Math.min(minimum, point.y - terrain(point.x, point.z));
    }
  });
  return minimum;
}

describe('grounded terminal articulation', () => {
  it.each([
    ['bulwark_assault', false], ['bulwark_assault', true],
    ['sentinel_brawler', false], ['sentinel_brawler', true],
  ] as const)('keeps the actual %s shell supported with a shortened leg: %s', (designId, lostLeg) => {
    const entity = spawnDesign(testWorld('wreck-grounding'), designId);
    const chassis = catalog.chassis.get(entity.chassisId)!;
    const model = buildMechModel(chassis.silhouette, chassis.traits, entity.tonnage, 0x78c9ff,
      true, [], new Set(lostLeg ? ['left_leg'] : []), chassis.hardpoints, chassis.id, {}, chassis.faction);
    const terrain = (x: number, z: number) => 3 + x * 0.07 - z * 0.04;
    const heightAt = vi.fn(terrain);
    const land = vi.fn();
    const effects = { land, plume: vi.fn() } as unknown as BattleEffects;
    const locomotion = new Locomotion(heightAt, () => 'open', effects);
    entity.destroyed = true;
    model.terminalFallAxis = { pitch: 1, roll: 0 };
    locomotion.authorizeTerminalFall(entity.id);
    const at = { x: 17, y: 23, facing: 0.3, torso: 0.2 };
    for (const dt of [0.05, 0.2, 0.4, 1]) {
      locomotion.place(entity, model, at, 0, dt);
      expect(minimumClearance(model, terrain)).toBeCloseTo(0, 5);
    }
    expect(land).toHaveBeenCalledTimes(1);
    expect(model.root.rotation.x).toBeGreaterThan(1);
    expect(Math.abs(model.root.rotation.z)).toBeGreaterThan(0.01);
    const position = model.root.position.clone();
    const surfaces = model.terminalSupport.surfaces;
    heightAt.mockClear();
    locomotion.place(entity, model, at, 0, 1);
    expect(model.root.position.distanceTo(position)).toBeLessThan(1e-8);
    expect(model.terminalSupport.surfaces).toBe(surfaces);
    expect(heightAt.mock.calls.length).toBeLessThan(20);
    expect(land).toHaveBeenCalledTimes(1);
    disposeModel(model.root);
  });
});
