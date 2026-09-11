import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../schema/load';
import { chassisBlueprint } from '../render/blueprint';
import { radiusFor } from '../render/shape';
import { buildMechModel, disposeModel } from './mechModel';
import { HERO_MECH_RENDER, TACTICAL_MECH_RENDER } from './renderQuality';

const catalog = loadCatalog();

describe('stacked weapon housings', () => {
  it.each([TACTICAL_MECH_RENDER, HERO_MECH_RENDER])('keeps every stock weapon distinct at $geometry quality without moving the first hardpoint', quality => {
    let stackedWeapons = 0;
    for (const design of catalog.designs.values()) {
      const chassis = catalog.chassis.get(design.chassisId)!;
      const mounts = design.mounts.map(mount => {
        const weapon = catalog.weapons.get(mount.weaponId)!;
        return { ...mount, type: weapon.type, tonnage: weapon.tonnage, projectiles: weapon.projectiles,
          recoil: weapon.recoil, visual: weapon.visual };
      });
      const model = buildMechModel(chassis.silhouette, chassis.traits, chassis.tonnage, 0x88b7ba,
        false, mounts, new Set(), chassis.hardpoints, chassis.id, {}, chassis.faction, quality);
      try {
        const plan = chassisBlueprint(chassis.silhouette, chassis.traits, chassis.hardpoints, chassis.id);
        const scale = radiusFor(chassis.tonnage);
        const boundsByLocation = new Map<string, Box3>();
        model.root.updateMatrixWorld(true);
        expect(model.weapons, design.id).toHaveLength(mounts.length);
        model.weapons.forEach((weapon, index) => {
          const mount = mounts[index]!;
          expect(weapon.weaponId).toBe(mount.weaponId);
          expect(weapon.slide.parent?.userData.detachmentLocation).toBe(mount.location);
          const bounds = new Box3().setFromObject(weapon.slide);
          const previous = boundsByLocation.get(mount.location);
          if (previous !== undefined) {
            stackedWeapons += 1;
            expect(bounds.min.y - previous.max.y, `${design.id} ${mount.location} ${mount.weaponId}`)
              .toBeGreaterThan(0);
          } else {
            const anchor = plan.hardpoints[mount.location]!;
            const position = weapon.slide.getWorldPosition(new Vector3());
            expect(position.x).toBeCloseTo(anchor[0] * scale);
            expect(position.y).toBeCloseTo((anchor[1] + plan.torsoY) * scale);
            expect(position.z).toBeCloseTo(anchor[2] * scale);
          }
          boundsByLocation.set(mount.location, bounds);
        });
      } finally { disposeModel(model.root); }
    }
    expect(stackedWeapons).toBeGreaterThan(10);
  });
});
