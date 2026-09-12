import { Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { catalog, spawnDesign, testWorld, unitOf } from '../../tests/support';
import { buildPreviewModel } from '../ui/mechbay/previewModel';
import { createEntityView, disposeEntityView } from './unitViewFactory';
import { buildMechModel, disposeModel } from './mechModel';
import { createWeaponMaterial } from './mechMaterials';
import type { Faction } from '../schema/faction';
import { ArmourFinishMaterial } from './armourFinish';

describe('visible refit identity', () => {
  it.each(['linewrought', 'aurelian'] as const)('keeps %s weapon construction across chassis origins', faction => {
    const weapon = catalog.weapons.get(faction === 'aurelian' ? 'medium_laser' : 'ac5')!;
    const modelFor = (host: Faction) => {
      const chassis = [...catalog.chassis.values()].find(c => c.faction === host)!;
      return buildMechModel(chassis.silhouette, chassis.traits, chassis.tonnage, 0x8dc4c4, false,
        [{ weaponId: weapon.id, location: 'left_arm', type: weapon.type, tonnage: weapon.tonnage,
          projectiles: weapon.projectiles, recoil: weapon.recoil, visual: weapon.visual }],
        new Set(), chassis.hardpoints, chassis.id, {}, host);
    };
    const native = modelFor(faction);
    const captured = modelFor(faction === 'linewrought' ? 'aurelian' : 'linewrought');
    try {
      const original = native.weapons[0]!.slide;
      const refit = captured.weapons[0]!.slide;
      expect(original.getObjectByName('cross-faction-adapter')).toBeUndefined();
      expect(refit.getObjectByName('cross-faction-adapter')).toBeDefined();
      expect(refit.userData.nativeFaction).toBe(faction);
      expect(refit.userData.mixedRefit).toBe(true);
      const housing = original.children.find(child => child instanceof Mesh)! as Mesh;
      const replacement = refit.getObjectByName(housing.name) as Mesh;
      expect((replacement.material as MeshStandardMaterial).color.getHex())
        .toBe((housing.material as MeshStandardMaterial).color.getHex());
      expect(captured.weapons[0]!.powered).toBe(true);
    } finally { disposeModel(native.root); disposeModel(captured.root); }
  });

  it('shows the same captured assembly in the bay and on the battlefield', () => {
    const world = testWorld('shared-captured-model');
    const entity = spawnDesign(world, 'bulwark_assault');
    const chassis = catalog.chassis.get(entity.chassisId)!;
    const design = catalog.designs.get(entity.designId)!;
    const preview = buildPreviewModel(catalog, chassis, design);
    const battle = createEntityView(world, entity, 'hero', false, undefined);
    try {
      expect(preview.model.weapons.map(rig => [rig.weaponId, rig.nativeFaction, rig.slide.userData.mixedRefit]))
        .toEqual(battle.model.weapons.map(rig => [rig.weaponId, rig.nativeFaction, rig.slide.userData.mixedRefit]));
      expect(preview.model.weapons.some(rig => rig.slide.userData.mixedRefit)).toBe(true);
    } finally { preview.dispose(); disposeEntityView(battle); }
  });

  it('keeps a cockpit-disabled hull recognisable while extinguishing all emitters', () => {
    const world = testWorld('stopped-cockpit');
    const entity = unitOf(world, 'sentinel_brawler');
    const live = createEntityView(world, entity, 'hero', false, undefined);
    const plateColours = (root: typeof live.model.root) => {
      const colours: number[] = [];
      root.traverse(node => {
        if (node instanceof Mesh && node.userData.damageLocation === 'centre_torso'
          && node.material instanceof ArmourFinishMaterial)
          colours.push((node.material as MeshStandardMaterial).color.getHex());
      });
      return colours;
    };
    entity.destroyed = true; entity.killMethod = 'head'; entity.locations.head.destroyed = true;
    const stopped = createEntityView(world, entity, 'hero', false, undefined);
    entity.locations.centre_torso.destroyed = true; entity.killMethod = 'centre_torso';
    const breached = createEntityView(world, entity, 'hero', false, undefined);
    try {
      expect(plateColours(stopped.model.root)).toEqual(plateColours(live.model.root));
      expect(plateColours(breached.model.root)).not.toEqual(plateColours(live.model.root));
      expect(stopped.model.weapons.every(rig => !rig.powered)).toBe(true);
      expect(stopped.model.startup).toBeNull();
    } finally { [live, stopped, breached].forEach(disposeEntityView); }
  });

  it('separates pale Aurelian housings from practical Linewrought metal', () => {
    const aurelian = createWeaponMaterial('energy', 'aurelian');
    const field = createWeaponMaterial('energy', 'linewrought');
    expect(aurelian.color.getHex()).not.toBe(field.color.getHex());
    expect(aurelian.roughness).toBeLessThan(field.roughness);
    aurelian.dispose(); field.dispose();
  });
});
