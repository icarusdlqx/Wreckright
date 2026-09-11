import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { catalog, testWorld, unitOf } from '../../tests/support';
import type { BattleEffects } from './battleEffects';
import { Locomotion } from './locomotion';
import { buildMechModel, disposeModel } from './mechModel';
import { triggerHullRecoil } from './machineCulture';

function harness(id = 'hornet_spotter', reduced = false) {
  const entity = unitOf(testWorld('motion-feedback'), id);
  const chassis = catalog.chassis.get(entity.chassisId)!;
  const model = buildMechModel(chassis.silhouette, chassis.traits, entity.tonnage, 0x78c9ff, false, [],
    new Set(), chassis.hardpoints, chassis.id, {}, chassis.faction);
  const plumes: Vector3[] = [];
  const effects = { land: vi.fn(), plume: (_key: number, at: Vector3) => plumes.push(at.clone()) } as unknown as BattleEffects;
  const locomotion = new Locomotion(() => 0, (at) => at.y < 0 ? 'water' : 'open', effects, reduced);
  return { entity, model, locomotion, plumes };
}

describe('machine weight and physical effect origins', () => {
  it('reports alternating sole contacts with terrain sampled beneath the contacting foot', () => {
    const { entity, model, locomotion } = harness();
    const contacts: { x: number; y: number; terrain: string; height: number }[] = [];
    locomotion.onFootfall = (at, _tonnage, _faction, contact) => {
      contacts.push({ x: at.x, y: at.y, terrain: contact!.terrain, height: contact!.height });
    };
    for (let frame = 0; frame <= 70; frame += 1) {
      locomotion.place(entity, model, { x: frame * model.strideLength / 18, y: 0, facing: 0, torso: 0 }, 0, 1 / 30);
    }
    expect(contacts.length).toBeGreaterThan(2);
    expect(contacts.some((contact) => contact.y < -1 && contact.terrain === 'water')).toBe(true);
    expect(contacts.some((contact) => contact.y > 1 && contact.terrain === 'open')).toBe(true);
    expect(contacts.every((contact) => Math.abs(contact.height) < 0.3)).toBe(true);
    disposeModel(model.root);
  });

  it('burns from the authored rear nozzles after the torso turns and the knees tuck', () => {
    const { entity, model, locomotion, plumes } = harness();
    entity.jump = { from: { x: 0, y: 0 }, to: { x: 80, y: 0 }, elapsed: 0.1, duration: 1 };
    locomotion.place(entity, model, { x: 8, y: 0, facing: 0.4, torso: 0.2 }, 12, 0.1);
    expect(plumes).toHaveLength(2);
    for (let index = 0; index < 2; index += 1) {
      const nozzle = model.services.jets[index]!.getWorldPosition(new Vector3());
      const knee = model.legs[index]!.knee.getWorldPosition(new Vector3());
      expect(plumes[index]!.distanceTo(nozzle)).toBeLessThan(1e-6);
      expect(plumes[index]!.distanceTo(knee)).toBeGreaterThan(2);
    }
    plumes.length = 0;
    entity.destroyed = true;
    locomotion.place(entity, model, { x: 8, y: 0, facing: 0.4, torso: 0.2 }, 12, 0.1);
    expect(plumes).toHaveLength(0);
    disposeModel(model.root);
  });

  it('keeps sealed bracing restrained and reduced motion free of stance impulses', () => {
    const welded = harness();
    const sealed = harness('sentinel_brawler');
    const reduced = harness('hornet_spotter', true);
    for (const setup of [welded, sealed, reduced]) {
      triggerHullRecoil(setup.model.hullRecoil, setup.model.culture, 0.8);
      setup.locomotion.place(setup.entity, setup.model, { x: 0, y: 0, facing: 0, torso: 0 }, 0, 0.1);
      expect(setup.model.root.position.x).toBe(0);
    }
    expect(welded.model.torso.position.x).toBeLessThan(0);
    expect(sealed.model.torso.position.x).toBe(0);
    expect(Math.abs(sealed.model.legs[0]!.knee.rotation.z)).toBeLessThan(Math.abs(welded.model.legs[0]!.knee.rotation.z));
    expect(reduced.model.torso.position.x).toBe(0);
    for (const setup of [welded, sealed, reduced]) disposeModel(setup.model.root);
  });

  it('folds knees and shoulder assemblies during a directional fall and holds the final pose', () => {
    const { entity, model, locomotion } = harness('sentinel_brawler');
    entity.destroyed = true;
    model.terminalFallAxis = { pitch: 1, roll: 0 };
    locomotion.authorizeTerminalFall(entity.id);
    const at = { x: 0, y: 0, facing: 0, torso: 0 };
    locomotion.place(entity, model, at, 0, 1);
    expect(model.root.rotation.x).toBeCloseTo(1.22);
    expect(model.legs.every((leg) => leg.knee.rotation.z < -0.4)).toBe(true);
    expect(model.articulation.arms.every((arm) => arm.pivot.rotation.z > 0.1)).toBe(true);
    const knee = model.legs[0]!.knee.rotation.z;
    locomotion.place(entity, model, at, 0, 1);
    expect(model.legs[0]!.knee.rotation.z).toBe(knee);
    disposeModel(model.root);
  });
});
