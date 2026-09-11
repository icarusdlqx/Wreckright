import { Mesh, Raycaster, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { buildMechModel, disposeModel } from './mechModel';
import { updateMachineHeat } from './machineServices';

function modelFor(id: string, lost = false) {
  const chassis = catalog.chassis.get(id)!;
  return buildMechModel(chassis.silhouette, chassis.traits, chassis.tonnage, 0x78c9ff, false, [],
    new Set(lost ? ['left_leg'] : []), chassis.hardpoints, id, {}, chassis.faction);
}

describe('physical machine service anchors', () => {
  it('authors rear nozzles only for the four actual jump chassis', () => {
    for (const chassis of catalog.chassis.values()) {
      if (chassis.frame !== 'mech') continue;
      const model = modelFor(chassis.id);
      expect(model.services.jets, chassis.id).toHaveLength(chassis.jumpCapable ? 2 : 0);
      expect(model.services.vents, chassis.id).toHaveLength(2);
      for (const nozzle of model.services.jets) {
        expect(nozzle.parent).toBeInstanceOf(Mesh);
        expect(nozzle.parent?.name).toBe('jump-service-housing');
        expect(nozzle.position.y).toBeLessThan(0);
        expect(nozzle.parent?.parent).toBe(model.torso);
      }
      disposeModel(model.root);
    }
  });

  it('attaches sole contacts to visible feet and never invents a sole for a lost leg', () => {
    const point = new Vector3();
    for (const id of ['hornet_hnt2', 'sentinel_snl2', 'colossus_cls1', 'pallvault_plv1']) {
      const model = modelFor(id);
      for (const leg of model.legs) {
        expect(leg.sole.parent).toBe(leg.ankle);
        leg.sole.getWorldPosition(point);
        const meshes = leg.ankle.children.filter((child): child is Mesh => child instanceof Mesh);
        const minimum = Math.min(...meshes.map((mesh) => mesh.position.y + mesh.geometry.boundingBox!.min.y));
        expect(leg.sole.position.y, id).toBeCloseTo(minimum);
        expect(Math.abs(point.z), id).toBeGreaterThan(1);
      }
      disposeModel(model.root);
      const lost = modelFor(id, true);
      expect(lost.legs.find((leg) => leg.destroyed)?.sole.userData.authored).not.toBe(true);
      disposeModel(lost.root);
    }
  });

  it('places every rear vent outside and in physical contact with the outer casing', () => {
    const ray = new Raycaster();
    for (const chassis of catalog.chassis.values()) {
      if (chassis.frame !== 'mech') continue;
      const model = modelFor(chassis.id);
      model.root.updateWorldMatrix(true, true);
      const carriers: Mesh[] = [];
      model.root.traverse((node) => {
        if (node instanceof Mesh && node.userData.damageLocation === 'centre_torso'
          && node.userData.blueprintDetail === 'structure' && node.name !== 'jump-service-housing') carriers.push(node);
      });
      for (const outlet of model.services.vents) {
        const vent = outlet.parent as Mesh;
        const centre = vent.getWorldPosition(new Vector3());
        ray.set(new Vector3(-100, centre.y, centre.z), new Vector3(1, 0, 0));
        const hull = ray.intersectObjects(carriers, false)[0];
        expect(hull, chassis.id).toBeDefined();
        // Normal vents penetrate slightly; jump-frame vents sit on their connected housing.
        const support = model.services.jets.length > 0
          ? model.services.jets.find((jet) => jet.parent!.position.z === vent.position.z)!.parent as Mesh : vent;
        support.geometry.computeBoundingBox();
        const supportCentre = support.getWorldPosition(new Vector3());
        expect(centre.x, chassis.id).toBeLessThan(hull!.point.x);
        expect(supportCentre.x + support.geometry.boundingBox!.max.x, chassis.id)
          .toBeGreaterThan(hull!.point.x);
        expect(supportCentre.x + support.geometry.boundingBox!.min.x, chassis.id)
          .toBeLessThan(hull!.point.x);
      }
      disposeModel(model.root);
    }
  });

  it('heats only the owned vent material and clears the glow when power fails', () => {
    const model = modelFor('sentinel_snl2');
    const material = model.services.heatMaterial!;
    const nodes: object[] = [];
    model.root.traverse((node) => nodes.push(node));
    updateMachineHeat(model.services, 0.2, true);
    expect(material.emissiveIntensity).toBe(0);
    updateMachineHeat(model.services, 0.95, true);
    expect(material.emissiveIntensity).toBeGreaterThan(0.5);
    for (let index = 0; index < 100; index += 1) updateMachineHeat(model.services, 0.9, true);
    const after: object[] = [];
    model.root.traverse((node) => after.push(node));
    expect(after).toEqual(nodes);
    updateMachineHeat(model.services, 1.2, false);
    expect(material.emissiveIntensity).toBe(0);
    expect(model.services.heatMaterial).toBe(material);
    disposeModel(model.root);
  });

  it.each(['warden_wrd5', 'pallvault_plv1'])('supports both full vent edges on the %s roof-cap face', (id) => {
    const model = modelFor(id);
    model.root.updateWorldMatrix(true, true);
    const carriers: Mesh[] = [];
    model.root.traverse((node) => {
      if (node instanceof Mesh && node.userData.damageLocation === 'centre_torso'
        && node.userData.blueprintDetail === 'structure') carriers.push(node);
    });
    const ray = new Raycaster();
    for (const outlet of model.services.vents) {
      const vent = outlet.parent as Mesh;
      vent.geometry.computeBoundingBox();
      const bounds = vent.geometry.boundingBox!;
      const centre = vent.getWorldPosition(new Vector3());
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          ray.set(new Vector3(-100, centre.y + y, centre.z + z), new Vector3(1, 0, 0));
          const hit = ray.intersectObjects(carriers, false)[0];
          expect(hit, `${id} edge y=${y}, z=${z}`).toBeDefined();
          expect(centre.x + bounds.max.x, `${id} edge remains attached`)
            .toBeGreaterThanOrEqual(hit!.point.x);
          expect(centre.x + bounds.min.x, `${id} edge remains exposed`)
            .toBeLessThan(hit!.point.x);
        }
      }
    }
    disposeModel(model.root);
  });
});
