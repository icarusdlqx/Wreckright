import { describe, expect, it } from 'vitest';
import type { Design } from '../schema/design';
import type { Catalog } from '../schema/load';
import { WeaponSchema } from '../schema/weapon';
import { spawnDesign, testWorld } from '../../tests/support';
import type { MechEntity, World } from '../sim/types';
import { reactorReadout } from './combatTelemetry';
import { fitCooling } from './mechbay/editor';

function syntheticCatalog(catalog: Catalog): Catalog {
  const base = catalog.weapons.get('lbx_ac10');
  if (base === undefined) throw new Error('missing LB-X cannon');
  const synthetic = WeaponSchema.parse({
    ...structuredClone(base),
    modes: [
      { id: 'steady', name: 'Steady', damage: base.damage },
      { id: 'overdrive', name: 'Overdrive', heat: 12, cooldown: 0.75 },
    ],
  });
  return {
    ...catalog,
    weapons: new Map(catalog.weapons).set(synthetic.id, synthetic),
  };
}

function lbxUnit(seed: string): { world: World; mech: MechEntity } {
  const world = testWorld(seed);
  const mech = spawnDesign(world, 'redoubt_emplacement', 0);
  world.catalog = syntheticCatalog(world.catalog);
  mech.weapons = mech.weapons.filter((mount) => mount.weaponId === 'lbx_ac10');
  mech.ammoBins = mech.ammoBins.filter((bin) => bin.weaponId === 'lbx_ac10');
  for (const bin of mech.ammoBins) bin.rounds = 1;
  return { world, mech };
}

function designInMode(catalog: Catalog, modeId: string): Design {
  const design = structuredClone(catalog.designs.get('redoubt_emplacement'));
  if (design === undefined) throw new Error('missing Redoubt design');
  const mount = design.mounts.find((candidate) => candidate.weaponId === 'lbx_ac10');
  if (mount === undefined) throw new Error('missing LB-X design mount');
  mount.modeId = modeId;
  return design;
}

describe('selected fire modes in UI calculations', () => {
  it('projects alpha heat from the selected profile', () => {
    const { world, mech } = lbxUnit('fire-mode-telemetry');
    const mount = mech.weapons[0];
    if (mount === undefined) throw new Error('missing LB-X mount');

    mount.modeId = 'steady';
    expect(reactorReadout(world, mech).alphaHeat).toBe(2);
    mount.modeId = 'overdrive';
    expect(reactorReadout(world, mech).alphaHeat).toBe(12);
  });

  it('fits cooling for the selected design profile', () => {
    const catalog = syntheticCatalog(testWorld('fire-mode-fit-cooling').catalog);
    const steady = fitCooling(catalog, designInMode(catalog, 'steady'));
    const overdrive = fitCooling(catalog, designInMode(catalog, 'overdrive'));

    expect(overdrive.heatSinks).toBeGreaterThan(steady.heatSinks);
  });
});
