import { Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { catalog, testWorld, unitOf } from '../../tests/support';
import { buildMechModel, disposeModel } from './mechModel';
import { advanceStartupSequence, lampFlickerLit } from './startupLights';
import { modelDamageSignature } from './unitVisualState';

function sentinel(wear: Parameters<typeof buildMechModel>[9]) {
  const chassis = catalog.chassis.get('sentinel_snl2');
  if (chassis === undefined) throw new Error('missing sentinel');
  return buildMechModel(
    chassis.silhouette, chassis.traits, chassis.tonnage, 0x78c9ff, false, [],
    new Set(), chassis.hardpoints, chassis.id, wear, chassis.faction,
  );
}

function plateColour(model: ReturnType<typeof buildMechModel>, location: string): number {
  let colour = -1;
  model.root.traverse((node) => {
    if (colour >= 0 || !(node instanceof Mesh) || node.userData.damageLocation !== location) return;
    if (node.material instanceof MeshStandardMaterial) colour = node.material.color.getHex();
  });
  return colour;
}

describe('sealed hull damage legibility', () => {
  it('keeps the shell smooth but darkens the finish once a location is heavily worn', () => {
    const clean = sentinel({});
    const worn = sentinel({ centre_torso: 1 });
    const hammered = sentinel({ centre_torso: 2 });
    const cleanColour = plateColour(clean, 'centre_torso');
    expect(plateColour(worn, 'centre_torso')).toBe(cleanColour);
    expect(plateColour(hammered, 'centre_torso')).toBeLessThan(cleanColour);
    expect(plateColour(hammered, 'left_torso')).toBe(plateColour(clean, 'left_torso'));
    let loose = 0;
    hammered.root.traverse((node) => { if (node.userData.loosePanel === true) loose += 1; });
    expect(loose).toBe(0);
    for (const model of [clean, worn, hammered]) disposeModel(model.root);
  });

  it('dims and flickers the lamps of a heavily worn channel', () => {
    const model = sentinel({ head: 2 });
    const eyes = model.startup?.lights.filter((light) => light.name.startsWith('startup-light:')) ?? [];
    expect(eyes.length).toBe(3);
    const eye = eyes[0]?.material;
    expect(eye).toBeInstanceOf(MeshStandardMaterial);
    expect((eye as MeshStandardMaterial).emissiveIntensity).toBeLessThan(2);
    expect(model.startup?.flicker?.slice(0, 3)).toEqual([true, true, true]);

    let dark = 0;
    for (let step = 0; step < 200; step += 1) {
      advanceStartupSequence(model, 0.031, false);
      if (eyes.some((light) => !light.visible)) dark += 1;
    }
    expect(dark).toBeGreaterThan(0);
    expect(dark).toBeLessThan(200);
    // Reduced motion keeps the dim lamp steady.
    advanceStartupSequence(model, 5, true);
    expect(eyes.every((light) => light.visible)).toBe(true);
    disposeModel(model.root);
  });

  it('rebuilds a sealed view only when core wear reaches the heavy tier', () => {
    const world = testWorld('sealed-heavy-wear');
    const entity = unitOf(world, 'sentinel_brawler');
    const clean = modelDamageSignature(entity, 'aurelian');
    const core = entity.locations.centre_torso;
    core.armour = core.armourMax * 0.5;
    core.rearArmour = core.rearArmourMax * 0.5;
    core.internal = core.internalMax * 0.5;
    expect(modelDamageSignature(entity, 'aurelian')).toBe(clean);
    core.armour = 0;
    core.rearArmour = 0;
    core.internal = core.internalMax * 0.3;
    expect(modelDamageSignature(entity, 'aurelian')).not.toBe(clean);
  });

  it('never leaves a flickering lamp dark for long', () => {
    let longestDark = 0;
    let run = 0;
    for (let step = 0; step < 2000; step += 1) {
      if (lampFlickerLit(step * 0.016, 1)) run = 0;
      else run += 1;
      longestDark = Math.max(longestDark, run);
    }
    expect(longestDark).toBeLessThan(20);
  });
});
