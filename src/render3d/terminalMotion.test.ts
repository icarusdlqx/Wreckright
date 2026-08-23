import { describe, expect, it, vi } from 'vitest';
import { catalog, spawnDesign, testWorld } from '../../tests/support';
import type { BattleEffects } from './battleEffects';
import { Locomotion } from './locomotion';
import { buildMechModel, disposeModel } from './mechModel';

function terminalHarness(designId: string) {
  const world = testWorld('terminal-presentation');
  const entity = spawnDesign(world, designId);
  const chassis = catalog.chassis.get(entity.chassisId);
  if (chassis === undefined) throw new Error(`unknown chassis ${entity.chassisId}`);
  const land = vi.fn();
  const effects = { land, plume: vi.fn() } as unknown as BattleEffects;
  const model = buildMechModel(
    chassis.silhouette,
    chassis.traits,
    entity.tonnage,
    0x78c9ff,
    false,
    [],
    new Set(),
    chassis.hardpoints,
    chassis.id,
    {},
    chassis.faction,
  );
  const locomotion = new Locomotion(() => 0, () => 'open', effects);
  return { entity, model, locomotion, land };
}

describe('terminal and power-down motion', () => {
  it('drops a sealed wreck faster than welded shopwork without hiding either fall', () => {
    const sealed = terminalHarness('wisp_scout');
    const welded = terminalHarness('hornet_spotter');
    sealed.entity.destroyed = true;
    welded.entity.destroyed = true;
    sealed.locomotion.place(
      sealed.entity,
      sealed.model,
      { x: 0, y: 0, facing: 0, torso: 0 },
      0,
      0.1,
    );
    welded.locomotion.place(
      welded.entity,
      welded.model,
      { x: 0, y: 0, facing: 0, torso: 0 },
      0,
      0.1,
    );
    expect(Math.abs(sealed.model.root.rotation.z))
      .toBeGreaterThan(Math.abs(welded.model.root.rotation.z) * 1.5);
    expect(Math.abs(sealed.model.root.rotation.z)).toBeLessThan(1.22);
    expect(Math.abs(welded.model.root.rotation.z)).toBeLessThan(1.22);
    disposeModel(sealed.model.root);
    disposeModel(welded.model.root);
  });

  it('falls away along the most recent impact axis instead of entity parity', () => {
    const struckFromTheSide = terminalHarness('hornet_spotter');
    struckFromTheSide.entity.destroyed = true;
    struckFromTheSide.model.terminalFallAxis = { pitch: 1, roll: 0 };
    struckFromTheSide.locomotion.place(
      struckFromTheSide.entity,
      struckFromTheSide.model,
      { x: 0, y: 0, facing: 0, torso: 0 },
      0,
      0.2,
    );
    expect(Math.abs(struckFromTheSide.model.root.rotation.x)).toBeGreaterThan(0.4);
    expect(struckFromTheSide.model.root.rotation.z).toBeCloseTo(0);
    disposeModel(struckFromTheSide.model.root);
  });

  it('leaves a destroyed knocked-down hull on the ground without landing twice', () => {
    const downed = terminalHarness('hornet_spotter');
    const pose = { x: 0, y: 0, facing: 0, torso: 0 };
    downed.entity.downRemaining = 2;
    downed.locomotion.place(downed.entity, downed.model, pose, 0, 0.5);
    const settledRotation = Math.abs(downed.model.root.rotation.z);
    expect(settledRotation).toBeGreaterThan(1);
    expect(downed.land).toHaveBeenCalledTimes(1);

    downed.entity.destroyed = true;
    downed.locomotion.place(downed.entity, downed.model, pose, 0, 0.01);

    expect(Math.abs(downed.model.root.rotation.z)).toBeGreaterThanOrEqual(settledRotation);
    expect(downed.land).toHaveBeenCalledTimes(1);
    disposeModel(downed.model.root);
  });

  it.each(['sentinel_brawler', 'hornet_spotter'] as const)(
    'holds %s in a legible powered-down stance',
    (designId) => {
      const { entity, model, locomotion } = terminalHarness(designId);
      entity.shutdownRemaining = 2;
      locomotion.place(entity, model, { x: 0, y: 0, facing: 0, torso: 0 }, 0, 0.1);
      expect(model.legs.every((leg) => leg.knee.rotation.z < -0.25)).toBe(true);
      if (model.faction === 'linewrought') {
        expect(model.legs[0]?.knee.rotation.z).not.toBe(model.legs[1]?.knee.rotation.z);
      }
      expect(model.torso.position.y).toBeLessThan(model.torsoRestY);
      disposeModel(model.root);
    },
  );

  it.each([
    ['courser_patrol', 'wheeled'],
    ['drover_carrier', 'tracked'],
    ['redoubt_emplacement', 'emplacement'],
  ] as const)('restores the %s %s hull after restart', (designId, _form) => {
    const { entity, model, locomotion } = terminalHarness(designId);
    const pose = { x: 0, y: 0, facing: 0, torso: 0 };
    expect(model.motion).toBeNull();
    entity.shutdownRemaining = 2;
    locomotion.place(entity, model, pose, 0, 0.1);
    expect(model.torso.position.y).toBeLessThan(model.torsoRestY);

    entity.shutdownRemaining = 0;
    locomotion.place(entity, model, pose, 0, 0.1);
    expect(model.torso.position.y).toBe(model.torsoRestY);
    expect(model.torso.rotation.x).toBe(0);
    expect(model.torso.rotation.z).toBe(0);
    disposeModel(model.root);
  });
});
