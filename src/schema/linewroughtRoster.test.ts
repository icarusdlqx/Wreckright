import { describe, expect, it } from 'vitest';
import { catalog, spawnDesign, testWorld } from '../../tests/support';
import { roleOf, type CombatRole } from '../sim/ai/roles';
import { computeHeatProfile, computeLoadout } from '../sim/loadout';
import { validateDesign } from './designValidation';

const NEW_WALKERS = ['prybar_courier', 'rivet_escort', 'trestle_battery'] as const;

function designOf(id: string) {
  const design = catalog.designs.get(id);
  if (design === undefined) throw new Error(`missing stock design ${id}`);
  return design;
}

describe('the complete Linewrought walker ladder', () => {
  it.each(NEW_WALKERS)('%s is a legal, fully loaded walker with protected ammunition', (id) => {
    const design = designOf(id);
    const report = validateDesign(catalog, design);
    expect(catalog.chassis.get(design.chassisId)?.frame).toBe('mech');
    expect(report.issues, id).toEqual([]);
    expect(report.valid, id).toBe(true);
    expect(report.loadout.freeTonnage, id).toBeCloseTo(0, 6);
    for (const ammo of design.ammo) {
      expect(design.equipment.some((fit) =>
        fit.equipmentId === 'case' && fit.location === ammo.location),
      `${id}: ${ammo.location} ammunition has no blowout cell`).toBe(true);
    }
  });

  it.each(NEW_WALKERS)('%s uses locally serviceable parts and sustains its stock battery', (id) => {
    const design = designOf(id);
    expect(catalog.chassis.get(design.chassisId)?.faction).toBe('linewrought');
    for (const mount of design.mounts) {
      expect(catalog.weapons.get(mount.weaponId)?.faction, `${id}.${mount.weaponId}`)
        .toBe('linewrought');
    }
    for (const fit of design.equipment) {
      expect(catalog.equipment.get(fit.equipmentId)?.faction, `${id}.${fit.equipmentId}`)
        .toBe('linewrought');
    }
    expect(catalog.equipment.get(design.heatSinkId)?.faction).toBe('linewrought');
    const heat = computeHeatProfile(catalog, design);
    expect(heat.sustainable, id).toBe(true);
    expect(heat.alphaSafe, id).toBe(true);
  });

  it('fills scouting, close escort and indirect support jobs under the existing classifier', () => {
    const world = testWorld('ironwork-stock-roles');
    const roles = new Map<string, CombatRole>([
      ['prybar_courier', 'scout'],
      ['rivet_escort', 'brawler'],
      ['trestle_battery', 'missile_boat'],
    ]);
    for (const [id, role] of roles) {
      expect(roleOf(world, spawnDesign(world, id)).role, id).toBe(role);
    }
  });

  it('retains a reason to field the established spotter and heavy battery', () => {
    const prybar = computeLoadout(catalog, designOf('prybar_courier'));
    const gadfly = computeLoadout(catalog, designOf('hornet_spotter'));
    const trestle = computeLoadout(catalog, designOf('trestle_battery'));
    const cairn = computeLoadout(catalog, designOf('cairn_battery'));
    expect(prybar.armourPoints).toBeLessThan(gadfly.armourPoints);
    expect(prybar.tonnage).toBeLessThan(gadfly.tonnage);
    expect(designOf('prybar_courier').equipment.some((fit) =>
      fit.equipmentId === 'narc' || fit.equipmentId === 'jump_jet')).toBe(false);
    expect(trestle.armourPoints).toBeLessThan(cairn.armourPoints);
    expect(trestle.tonnage).toBeLessThan(cairn.tonnage);
    expect(designOf('trestle_battery').mounts.length).toBeLessThan(designOf('cairn_battery').mounts.length);
  });

  it('retains the two vehicles and emplacement outside the sixteen-walker roster', () => {
    const support = [...catalog.chassis.values()].filter((chassis) => chassis.frame !== 'mech');
    expect(support.map((chassis) => [chassis.id, chassis.frame]).sort()).toEqual([
      ['courser_crs1', 'vehicle'], ['drover_dvr2', 'vehicle'], ['redoubt_rdt1', 'turret'],
    ]);
    expect([...catalog.chassis.values()].filter((chassis) => chassis.frame === 'mech')).toHaveLength(16);
  });

  it('preserves the existing shopwork mass, drive, protection and hull prices', () => {
    const expected = [
      ['hornet_spotter', 35, 280, 220, 2_600_000],
      ['cairn_battery', 65, 260, 432, 5_200_000],
      ['bulwark_assault', 70, 280, 376, 8_900_000],
      ['rampart_breaker', 85, 300, 590, 14_200_000],
      ['colossus_siege', 100, 300, 700, 9_200_000],
      ['courser_patrol', 30, 280, 118, 900_000],
      ['drover_carrier', 50, 200, 334, 1_650_000],
      ['redoubt_emplacement', 40, 100, 174, 900_000],
    ] as const;
    for (const [id, tonnage, engineRating, armour, baseCost] of expected) {
      const design = designOf(id);
      expect(catalog.chassis.get(design.chassisId), id).toMatchObject({ tonnage, engineRating, baseCost });
      expect(Object.values(design.armour).reduce((sum, points) => sum + points, 0), id).toBe(armour);
    }
  });
});
