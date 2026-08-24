import { describe, expect, it, vi } from 'vitest';
import type { MechLocation } from '../schema/common';
import { catalog, testWorld, unitOf } from '../../tests/support';
import type { BattleEffects } from './battleEffects';
import { settleFootContact } from './footContact';
import { posePersistentLimpLeg } from './limbDamageMotion';
import { Locomotion } from './locomotion';
import { createAnimationState } from './locomotionState';
import { buildMechModel, disposeModel } from './mechModel';

function harness(
  designId = 'sentinel_brawler',
  reducedMotion = false,
  terrainId: string | (() => string) = 'open',
  height = 0,
) {
  const world = testWorld(`limb-motion-${designId}`);
  const entity = unitOf(world, designId);
  const chassis = catalog.chassis.get(entity.chassisId);
  if (chassis === undefined) throw new Error(`unknown chassis ${entity.chassisId}`);
  const effects = { land: vi.fn(), plume: vi.fn() } as unknown as BattleEffects;
  const lost = new Set<MechLocation>();
  const model = buildMechModel(
    chassis.silhouette, chassis.traits, entity.tonnage, 0x78c9ff, false, [], lost,
    chassis.hardpoints, chassis.id, {}, chassis.faction,
  );
  const locomotion = new Locomotion(
    () => height,
    () => typeof terrainId === 'string' ? terrainId : terrainId(),
    effects,
    reducedMotion,
  );
  return { entity, model, locomotion };
}

function destroyLeftLeg(result: ReturnType<typeof harness>): void {
  const location = result.entity.locations.left_leg;
  location.armour = 0;
  location.rearArmour = 0;
  location.internal = 0;
  location.destroyed = true;
}

describe('leg-loss locomotion', () => {
  it.each(['sentinel_brawler', 'hornet_spotter'])(
    'stumbles once and then gives %s a persistent asymmetric limp',
    (designId) => {
      const result = harness(designId);
      const { entity, model, locomotion } = result;
      destroyLeftLeg(result);
      locomotion.place(entity, model, { x: 0, y: 0, facing: 0, torso: 0 }, 0, 1 / 60);
      locomotion.triggerLegLoss(entity.id, 'left_leg');
      locomotion.beginFrame(0.38);
      locomotion.place(entity, model, { x: 0.4, y: 0, facing: 0, torso: 0 }, 0, 0.38);

      const lost = model.legs.find((leg) => leg.location === 'left_leg');
      const support = model.legs.find((leg) => leg.location === 'right_leg');
      expect(lost?.knee.rotation.z).toBeLessThan(support?.knee.rotation.z ?? 0);
      expect(Math.abs(model.root.rotation.x)).toBeGreaterThan(0.12);

      locomotion.beginFrame(1);
      locomotion.place(
        entity, model, { x: model.strideLength * 0.22, y: 0, facing: 0, torso: 0 }, 0, 0.2,
      );
      expect(model.root.rotation.x).toBeCloseTo(0);
      expect(lost?.knee.rotation.z).toBeLessThan(-0.2);
      expect(Math.abs(model.torso.rotation.x)).toBeGreaterThan(0.03);
      disposeModel(model.root);
    },
  );

  it('ages the one-shot stumble while hidden instead of replaying it on reacquisition', () => {
    const result = harness();
    const { entity, model, locomotion } = result;
    destroyLeftLeg(result);
    locomotion.place(entity, model, { x: 0, y: 0, facing: 0, torso: 0 }, 0, 1 / 60);
    locomotion.triggerLegLoss(entity.id, 'left_leg');
    locomotion.beginFrame(2);
    locomotion.place(entity, model, { x: 0, y: 0, facing: 0, torso: 0 }, 0, 1 / 60);

    expect(model.root.rotation.x).toBeCloseTo(0);
    expect(Math.abs(model.torso.rotation.x)).toBeGreaterThan(0.03);
    disposeModel(model.root);
  });

  it('keeps reduced-motion damage readable without a dramatic hull lurch', () => {
    const result = harness('sentinel_brawler', true);
    const { entity, model, locomotion } = result;
    destroyLeftLeg(result);
    locomotion.triggerLegLoss(entity.id, 'left_leg');
    locomotion.beginFrame(0.38);
    locomotion.place(entity, model, { x: 0, y: 0, facing: 0, torso: 0 }, 0, 0.38);

    expect(Math.abs(model.root.rotation.x)).toBeGreaterThan(0.03);
    expect(Math.abs(model.root.rotation.x)).toBeLessThan(0.07);
    expect(model.legs.find((leg) => leg.location === 'left_leg')?.knee.rotation.z)
      .toBeLessThan(-0.5);
    disposeModel(model.root);
  });

  it('leaves two-leg immobilisation and terminal falls ahead of the stumble layer', () => {
    const immobilised = harness('sentinel_brawler');
    destroyLeftLeg(immobilised);
    immobilised.entity.locations.right_leg.destroyed = true;
    immobilised.locomotion.triggerLegLoss(immobilised.entity.id, 'left_leg');
    immobilised.locomotion.beginFrame(0.38);
    immobilised.locomotion.place(
      immobilised.entity, immobilised.model, { x: 0, y: 0, facing: 0, torso: 0 }, 0, 0.38,
    );
    expect(immobilised.model.root.rotation.x).toBeCloseTo(0);
    expect(immobilised.model.torso.rotation.x).toBeCloseTo(0);
    disposeModel(immobilised.model.root);

    const knockedDown = harness('sentinel_brawler');
    destroyLeftLeg(knockedDown);
    knockedDown.model.terminalFallAxis = { pitch: 1, roll: 0 };
    knockedDown.entity.downRemaining = 2;
    knockedDown.locomotion.triggerLegLoss(knockedDown.entity.id, 'left_leg');
    knockedDown.locomotion.place(
      knockedDown.entity, knockedDown.model, { x: 0, y: 0, facing: 0, torso: 0 }, 0, 0.2,
    );
    expect(knockedDown.model.root.rotation.x).toBeGreaterThan(0.5);
    disposeModel(knockedDown.model.root);

    const destroyed = harness('sentinel_brawler');
    destroyLeftLeg(destroyed);
    destroyed.model.terminalFallAxis = { pitch: 1, roll: 0 };
    destroyed.entity.destroyed = true;
    destroyed.locomotion.triggerLegLoss(destroyed.entity.id, 'left_leg');
    destroyed.locomotion.place(
      destroyed.entity, destroyed.model, { x: 0, y: 0, facing: 0, torso: 0 }, 0, 0.1,
    );
    expect(destroyed.model.root.rotation.x).toBeGreaterThan(1);
    disposeModel(destroyed.model.root);
  });

  it('keeps the surviving foot as the sole terrain contact throughout a limp', () => {
    const contactFor = (lost: 0 | 1): number => {
      const { model } = harness('sentinel_brawler');
      const state = createAnimationState();
      posePersistentLimpLeg(model, state, lost, Math.PI * 1.5, 0.4, 0.6);
      expect(state.poses[lost].planted).toBe(false);
      expect(state.poses[lost === 0 ? 1 : 0].planted).toBe(true);
      settleFootContact(state.contact, model, state.poses, (_x, z) => z * 0.05, 1);
      const body = state.contact.body;
      disposeModel(model.root);
      return body;
    };

    expect(contactFor(0)).toBeGreaterThan(contactFor(1));
  });
});

describe('water placement', () => {
  it('holds an upright hull halfway under the pond surface despite foot correction', () => {
    const { entity, model, locomotion } = harness('sentinel_brawler', false, 'water', 7);
    const expected = 7 - model.height * 0.46;
    for (let frame = 0; frame < 90; frame += 1) {
      locomotion.place(
        entity, model, { x: frame * 0.08, y: 0, facing: 0, torso: 0 }, 0, 1 / 60,
      );
      expect(model.root.position.y).toBeCloseTo(expected, 8);
    }
    disposeModel(model.root);
  });

  it('eases pond depth away during launch instead of snapping the hull upward', () => {
    const { entity, model, locomotion } = harness('sentinel_brawler', false, 'water', 7);
    locomotion.place(entity, model, { x: 0, y: 0, facing: 0, torso: 0 }, 0, 1 / 60);
    const pondDepth = -model.height * 0.46;
    entity.jump = { from: { x: 0, y: 0 }, to: { x: 20, y: 0 }, elapsed: 0.5, duration: 1 };
    locomotion.place(entity, model, { x: 10, y: 0, facing: 0, torso: 0 }, 12, 0.1);
    const firstOffset = model.root.position.y - 19;
    expect(firstOffset).toBeGreaterThan(pondDepth);
    expect(firstOffset).toBeLessThan(0);
    expect(firstOffset - pondDepth).toBeLessThan(Math.abs(pondDepth) * 0.5);
    let previous = firstOffset;
    for (let frame = 0; frame < 90; frame += 1) {
      locomotion.place(entity, model, { x: 10, y: 0, facing: 0, torso: 0 }, 12, 1 / 60);
      const offset = model.root.position.y - 19;
      expect(offset).toBeGreaterThanOrEqual(previous - 1e-8);
      expect(offset).toBeLessThanOrEqual(1e-8);
      previous = offset;
    }
    expect(previous).toBeCloseTo(0, 2);
    disposeModel(model.root);
  });

  it('keeps a fresh dry jump at its supplied airborne lift', () => {
    const { entity, model, locomotion } = harness('sentinel_brawler', false, 'open', 7);
    entity.jump = { from: { x: 0, y: 0 }, to: { x: 20, y: 0 }, elapsed: 0.5, duration: 1 };
    locomotion.place(entity, model, { x: 10, y: 0, facing: 0, torso: 0 }, 12, 0.1);
    expect(model.root.position.y).toBeCloseTo(19);
    disposeModel(model.root);
  });

  it('eases monotonically across both pond edges without overshooting either surface', () => {
    let terrain = 'open';
    const { entity, model, locomotion } = harness(
      'sentinel_brawler', false, () => terrain, 7,
    );
    const at = { x: 0, y: 0, facing: 0, torso: 0 };
    locomotion.place(entity, model, at, 0, 1 / 60);
    terrain = 'water';
    const target = -model.height * 0.46;
    let previous = 0;
    for (let frame = 0; frame < 90; frame += 1) {
      locomotion.place(entity, model, at, 0, 1 / 60);
      const offset = model.root.position.y - 7;
      expect(offset).toBeLessThanOrEqual(previous + 1e-8);
      expect(offset).toBeGreaterThanOrEqual(target - 1e-8);
      if (frame === 0) expect(Math.abs(offset)).toBeLessThan(Math.abs(target) * 0.2);
      previous = offset;
    }
    expect(previous).toBeCloseTo(target, 2);

    terrain = 'open';
    for (let frame = 0; frame < 90; frame += 1) {
      locomotion.place(entity, model, at, 0, 1 / 60);
      const offset = model.root.position.y - 7;
      expect(offset).toBeGreaterThanOrEqual(previous - 1e-8);
      expect(offset).toBeLessThanOrEqual(1e-8);
      previous = offset;
    }
    expect(previous).toBeCloseTo(0, 2);
    disposeModel(model.root);
  });
});
