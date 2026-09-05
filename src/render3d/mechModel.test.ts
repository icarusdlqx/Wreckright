import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { catalog } from '../../tests/support';
import { buildMechModel, disposeModel } from './mechModel';
import { advanceStartupSequence } from './startupLights';
import { poseLoosePanels } from './damagedPanels';
import { HERO_MECH_RENDER } from './renderQuality';

function blueprintTopology(root: Group): { meshes: number; triangles: number } {
  let meshes = 0;
  let triangles = 0;
  root.traverse((node) => {
    if (!(node instanceof Mesh) || node.userData.blueprintDetail !== 'structure') return;
    meshes += 1;
    triangles += node.geometry.index === null
      ? node.geometry.getAttribute('position').count / 3
      : node.geometry.index.count / 3;
  });
  return { meshes, triangles };
}

describe('mech model resources', () => {
  it('disposes shared and unattached owned resources once', () => {
    const root = new Group();
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshStandardMaterial();
    const unused = new MeshStandardMaterial();
    root.add(new Mesh(geometry, material), new Mesh(geometry, material));
    root.userData.ownedMaterials = [material, material, unused];
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const unusedDispose = vi.spyOn(unused, 'dispose');

    disposeModel(root);

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(unusedDispose).toHaveBeenCalledTimes(1);
  });

  it('builds hip, knee and ankle pivots without adding visible parts', () => {
    const chassis = catalog.chassis.get('sentinel_snl2');
    expect(chassis).toBeDefined();
    if (chassis === undefined) return;
    const model = buildMechModel(
      chassis.silhouette,
      chassis.traits,
      chassis.tonnage,
      0x78c9ff,
      false,
      [],
      new Set(),
      chassis.hardpoints,
      chassis.id,
      {},
      chassis.faction,
    );

    expect(model.motion?.form).toBe('humanoid');
    expect(model.legReach).toBeGreaterThan(model.strideLength);
    expect(model.root.rotation.order).toBe('YXZ');
    expect(model.torso.rotation.order).toBe('YXZ');
    expect(model.legs).toHaveLength(2);
    for (const leg of model.legs) {
      expect(leg.knee.parent).toBe(leg.hip);
      expect(leg.ankle.parent).toBe(leg.knee);
      expect(leg.ankle.children.length).toBeGreaterThan(0);
    }
    disposeModel(model.root);
  });

  it('preserves tactical topology while the inspection model spends more triangles', () => {
    const chassis = catalog.chassis.get('sentinel_snl2');
    expect(chassis).toBeDefined();
    if (chassis === undefined) return;
    const build = (hero: boolean) => buildMechModel(
      chassis.silhouette,
      chassis.traits,
      chassis.tonnage,
      0x78c9ff,
      false,
      [],
      new Set(),
      chassis.hardpoints,
      chassis.id,
      {},
      chassis.faction,
      hero ? HERO_MECH_RENDER : undefined,
    );
    const tactical = build(false);
    const hero = build(true);

    try {
      expect({ tactical: blueprintTopology(tactical.root), hero: blueprintTopology(hero.root) }).toEqual({
        tactical: { meshes: 24, triangles: 2060 }, hero: { meshes: 24, triangles: 3796 },
      });
      expect(tactical.root.userData.modelDetail).toBe('structure');
      expect(hero.root.userData.modelDetail).toBe('hero');
    } finally {
      disposeModel(tactical.root);
      disposeModel(hero.root);
    }
  });

  it('pulls one coarse welded panel loose at a breached location', () => {
    const chassis = catalog.chassis.get('hornet_hnt2');
    expect(chassis?.faction).toBe('linewrought');
    if (chassis === undefined) return;
    const model = buildMechModel(
      chassis.silhouette, chassis.traits, chassis.tonnage, 0x78c9ff, false, [],
      new Set(), chassis.hardpoints, chassis.id, { left_torso: 2 }, chassis.faction,
    );
    let loose = 0;
    model.root.traverse((node) => {
      if (node.userData.loosePanel === true) loose += 1;
    });
    expect(loose).toBe(1);
    expect(model.loosePanels).toHaveLength(1);
    const panel = model.loosePanels[0];
    expect(panel).toBeDefined();
    if (panel === undefined) return;
    poseLoosePanels(model.loosePanels, 0.5, 1, false);
    expect(panel.mesh.rotation.x).not.toBe(panel.restX);
    poseLoosePanels(model.loosePanels, 1, 1, true);
    expect(panel.mesh.rotation.x).toBe(panel.restX);
    disposeModel(model.root);
  });

  it('keeps a damaged sealed shell complete with a persistent blacked-out panel', () => {
    const chassis = catalog.chassis.get('sentinel_snl2');
    expect(chassis?.faction).toBe('aurelian');
    if (chassis === undefined) return;
    const model = buildMechModel(
      chassis.silhouette, chassis.traits, chassis.tonnage, 0x78c9ff, false, [],
      new Set(['left_arm']), chassis.hardpoints, chassis.id, { left_arm: 2 }, chassis.faction,
    );
    let armMeshes = 0;
    let failedArmMeshes = 0;
    let loose = 0;
    model.root.traverse((node) => {
      if (node.userData.damageLocation === 'left_arm') armMeshes += 1;
      if (node.userData.damageLocation === 'left_arm' && node.userData.sealedFailure === true) {
        failedArmMeshes += 1;
      }
      if (node.userData.loosePanel === true) loose += 1;
    });
    expect(armMeshes).toBeGreaterThan(0);
    expect(failedArmMeshes).toBe(armMeshes);
    expect(loose).toBe(0);
    expect(model.startup?.enabled.filter(Boolean).length)
      .toBeLessThan(model.startup?.lights.length ?? 0);
    disposeModel(model.root);
  });

  it.each([
    ['sentinel_snl2', 'aurelian'],
    ['hornet_hnt2', 'linewrought'],
  ] as const)(
    'turns a destroyed %s leg into a visible stump without hiding pre-loss damage',
    (chassisId, faction) => {
      const chassis = catalog.chassis.get(chassisId);
      expect(chassis?.faction).toBe(faction);
      if (chassis === undefined) return;
      const build = (destroyed: boolean) => buildMechModel(
        chassis.silhouette, chassis.traits, chassis.tonnage, 0x78c9ff, false, [],
        new Set(destroyed ? ['left_leg'] : []), chassis.hardpoints, chassis.id,
        { left_leg: 2 }, chassis.faction,
      );
      const damaged = build(false);
      const lost = build(true);
      const lowerMeshes = (model: typeof damaged): number => {
        let count = 0;
        model.root.traverse((node) => {
          if (
            node.userData.damageLocation === 'left_leg' &&
            (node.userData.limbJoint === 'knee' || node.userData.limbJoint === 'ankle')
          ) count += 1;
        });
        return count;
      };
      let stumpMeshes = 0;
      lost.root.traverse((node) => {
        if (
          node.userData.damageLocation === 'left_leg' && node.userData.limbJoint === 'hip'
        ) stumpMeshes += 1;
      });

      expect(lowerMeshes(damaged)).toBeGreaterThan(0);
      expect(lowerMeshes(lost)).toBe(0);
      expect(stumpMeshes).toBeGreaterThan(0);
      expect(lost.legs.find((leg) => leg.location === 'left_leg')?.destroyed).toBe(true);
      disposeModel(damaged.root);
      disposeModel(lost.root);
    },
  );

  it('sequences bounded head lights and broad power seams without growing the model', () => {
    const chassis = catalog.chassis.get('sentinel_snl2');
    if (chassis === undefined) return;
    const model = buildMechModel(
      chassis.silhouette, chassis.traits, chassis.tonnage, 0x78c9ff, false, [],
      new Set(), chassis.hardpoints, chassis.id, {}, chassis.faction,
    );
    expect(model.startup?.lights).toHaveLength(5);
    const children = model.torso.children.length;
    advanceStartupSequence(model, 0, false);
    expect(model.startup?.lights.filter((light) => light.visible)).toHaveLength(1);
    advanceStartupSequence(model, 0.17, false);
    expect(model.startup?.lights.filter((light) => light.visible)).toHaveLength(2);
    for (let frame = 0; frame < 10_000; frame += 1) {
      advanceStartupSequence(model, 1 / 60, false);
    }
    expect(model.startup?.lights.every((light) => light.visible)).toBe(true);
    expect(model.torso.children).toHaveLength(children);
    disposeModel(model.root);
  });
});
