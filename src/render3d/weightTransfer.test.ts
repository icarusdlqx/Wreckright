import { describe, expect, it, vi } from 'vitest';
import { catalog, testWorld, unitOf } from '../../tests/support';
import type { BattleEffects } from './battleEffects';
import { Locomotion } from './locomotion';
import { buildMechModel, disposeModel } from './mechModel';
import { createAnimationState } from './locomotionState';
import { advanceWeightSettle, applyStanceResponse } from './stanceResponse';
import { updateMachineHeat } from './machineServices';

function harness(reduced = false, designId = 'hornet_spotter') {
  const entity = unitOf(testWorld('weight-transfer'), designId);
  const chassis = catalog.chassis.get(entity.chassisId)!;
  const model = buildMechModel(chassis.silhouette, chassis.traits, entity.tonnage, 0x78c9ff, false, [],
    new Set(), chassis.hardpoints, chassis.id, {}, chassis.faction);
  const effects = { land: vi.fn(), plume: vi.fn() } as unknown as BattleEffects;
  return { entity, model, locomotion: new Locomotion(() => 0, () => 'open', effects, reduced) };
}

describe('readable machine weight transfer', () => {
  it('balances toward a turn and settles when stopped without shifting the commanded root', () => {
    for (const direction of [-1, 1]) {
      const { entity, model, locomotion } = harness();
      for (let frame = 0; frame <= 12; frame++) {
        locomotion.place(entity, model, { x: 50, y: 30, facing: frame * direction * 0.035, torso: 0 }, 0, 1 / 30);
      }
      expect(Math.sign(model.torso.position.z)).toBe(direction);
      expect(Math.abs(model.torso.position.z)).toBeLessThan(model.legReach * 0.03);
      expect(model.root.position.x).toBe(50);
      expect(model.root.position.z).toBe(30);
      const at = { x: 50, y: 30, facing: 12 * direction * 0.035, torso: 0 };
      const held = model.torso.position.z;
      locomotion.place(entity, model, at, 0, 0);
      expect(model.torso.position.z).toBe(held);
      for (let frame = 0; frame < 90; frame++) locomotion.place(entity, model, at, 0, 1 / 30);
      expect(model.torso.position.z).toBe(0);
      disposeModel(model.root);
    }
  });

  it('keeps Aurelian stabilization and reduced-motion poses free of lateral sway', () => {
    for (const [reduced, id] of [[true, 'hornet_spotter'], [false, 'sentinel_brawler']] as const) {
      const { entity, model, locomotion } = harness(reduced, id);
      for (let frame = 0; frame < 20; frame++) {
        locomotion.place(entity, model, { x: 50, y: 30, facing: frame * 0.02, torso: 0 }, 0, 1 / 30);
      }
      expect(model.torso.position.z).toBe(0);
      expect(model.root.position.x).toBe(50);
      expect(model.root.position.z).toBe(30);
      disposeModel(model.root);
    }
  });

  it('absorbs a stop through the knees and hull, with no response while paused or in reduced motion', () => {
    const { model } = harness();
    const state = createAnimationState();
    state.wasMoving = true;
    advanceWeightSettle(state, model, false, 1 / 60, false);
    model.torso.position.y = model.torsoRestY;
    applyStanceResponse(state, model, false);
    expect(model.torso.position.y).toBeLessThan(model.torsoRestY);
    expect(state.poses.every((pose) => pose.knee < 0)).toBe(true);
    const stopped = state.weightSettle;
    advanceWeightSettle(state, model, false, 0, false);
    expect(state.weightSettle).toBe(stopped);
    advanceWeightSettle(state, model, false, 1 / 60, true);
    expect(state.weightSettle).toBe(0);
    disposeModel(model.root);
  });

  it('makes near-overheating visibly warmer using the existing material and restores cool operation', () => {
    const { model } = harness(false, 'sentinel_brawler');
    const material = model.services.heatMaterial!;
    const emission = material.emissive;
    updateMachineHeat(model.services, 0.5, true);
    const cool = emission.clone();
    const coolIntensity = material.emissiveIntensity;
    updateMachineHeat(model.services, 0.98, true);
    expect(material.emissive).toBe(emission);
    expect(emission.r).toBeGreaterThan(cool.r);
    expect(material.emissiveIntensity).toBeGreaterThan(coolIntensity);
    updateMachineHeat(model.services, 0.2, true);
    expect(emission.equals(model.services.heatBaseEmission!)).toBe(true);
    expect(material.emissiveIntensity).toBe(0);
    updateMachineHeat(model.services, 1, false);
    expect(material.emissiveIntensity).toBe(0);
    disposeModel(model.root);
  });
});
