import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import type { Design } from '../../schema/design';
import { computeLoadout } from '../../sim/loadout';
import { remainingInventory } from './bayFit';
import { beginDesignHistory, pushDesign, redoDesign, undoDesign } from './designHistory';
import { confirmWeaponReplacement, evaluateWeaponReplacement } from './weaponReplacement';

function fixture(): Design {
  const design = structuredClone(catalog.designs.get('sentinel_brawler'));
  if (design === undefined) throw new Error('missing Sentinel');
  design.mounts = [{ weaponId: 'machine_gun', location: 'right_torso' }];
  design.ammo = [{ weaponId: 'machine_gun', location: 'left_torso', tons: 2 }];
  return design;
}

function inventory(design: Design, spare: string) {
  const weapon = new Map<string, number>([[spare, 1]]);
  for (const mount of design.mounts) weapon.set(mount.weaponId, (weapon.get(mount.weaponId) ?? 0) + 1);
  const equipment = new Map([[design.heatSinkId, design.heatSinks]]);
  for (const fit of design.equipment) equipment.set(fit.equipmentId, (equipment.get(fit.equipmentId) ?? 0) + 1);
  return { weapon, equipment };
}

describe('weapon replacement transaction', () => {
  it('previews a cross-faction swap without changing stock or draft and commits one undoable change', () => {
    const design = fixture();
    const original = structuredClone(design);
    const stock = inventory(design, 'medium_laser');
    const initialStock = structuredClone(stock);
    const request = { source: structuredClone(design), index: 0, weaponId: 'medium_laser' };
    const preview = evaluateWeaponReplacement(catalog, design, 0, 'medium_laser', stock);
    expect(preview.ok).toBe(true);
    expect(catalog.weapons.get('machine_gun')?.faction).not.toBe(catalog.weapons.get('medium_laser')?.faction);
    expect(design).toEqual(original);
    expect(stock).toEqual(initialStock);
    expect(preview.evaluation.nextDesign.ammo).toEqual([]);
    expect(preview.evaluation.nextDesign.mounts).toEqual([{ weaponId: 'medium_laser', location: 'right_torso' }]);

    const confirmed = confirmWeaponReplacement(catalog, design, request, stock);
    if (confirmed.nextDesign === null) throw new Error(confirmed.reason ?? 'replacement blocked');
    const history = pushDesign(beginDesignHistory(design), confirmed.nextDesign);
    expect(history.past).toHaveLength(1);
    expect(remainingInventory(stock, history.present)?.weapon.get('machine_gun')).toBe(1);
    expect(remainingInventory(stock, history.present)?.weapon.get('medium_laser')).toBe(0);
    const undone = undoDesign(history);
    expect(undone.present).toEqual(original);
    expect(remainingInventory(stock, undone.present)?.weapon.get('medium_laser')).toBe(1);
    expect(redoDesign(undone).present).toEqual(confirmed.nextDesign);
    expect(stock).toEqual(initialStock);
  });

  it('includes new ammo in the preview, final mass and the same undo step', () => {
    const design = fixture();
    design.mounts = [{ weaponId: 'medium_laser', location: 'right_torso' }];
    design.ammo = [];
    const stock = inventory(design, 'machine_gun');
    const preview = evaluateWeaponReplacement(catalog, design, 0, 'machine_gun', stock);
    expect(preview.ok).toBe(true);
    expect(preview.ammoLocation).toBe('right_torso');
    expect(preview.evaluation.nextDesign.ammo).toEqual([{ weaponId: 'machine_gun', location: 'right_torso', tons: 1 }]);
    expect(preview.evaluation.deltas.map((delta) => delta.component)).toEqual(['weapon', 'ammo']);
    expect(preview.evaluation.report.loadout.usedWeight).toBe(computeLoadout(catalog, preview.evaluation.nextDesign).usedWeight);
    const history = pushDesign(beginDesignHistory(design), preview.evaluation.nextDesign);
    expect(undoDesign(history).present).toEqual(design);
    expect(redoDesign(undoDesign(history)).present.ammo).toHaveLength(1);
  });

  it('keeps shared old ammunition while another gun still uses it', () => {
    const design = fixture();
    design.mounts.push({ weaponId: 'machine_gun', location: 'right_arm' });
    const preview = evaluateWeaponReplacement(catalog, design, 0, 'medium_laser', inventory(design, 'medium_laser'));
    expect(preview.ok).toBe(true);
    expect(preview.evaluation.nextDesign.ammo).toEqual(design.ammo);
    expect(preview.evaluation.deltas.filter((delta) => delta.component === 'ammo')).toHaveLength(0);
  });

  it('blocks unavailable stock, wrong mounts and oversized guns without consuming or removing anything', () => {
    const design = fixture();
    const stock = inventory(design, 'medium_laser');
    const original = structuredClone(design);
    for (const weaponId of ['lrm10', 'gauss_rifle', 'small_laser']) {
      const result = evaluateWeaponReplacement(catalog, design, 0, weaponId, stock);
      expect(result.ok).toBe(false);
      expect(result.evaluation.nextDesign).toEqual(original);
    }
    expect(design).toEqual(original);
    expect(stock.weapon.get('machine_gun')).toBe(1);
  });

  it('refuses a replacement if no room remains for required ammunition', () => {
    const design = fixture();
    design.mounts = [{ weaponId: 'medium_laser', location: 'right_torso' }];
    design.ammo = [];
    design.equipment = [];
    const loadout = computeLoadout(catalog, design);
    for (const [location, usage] of Object.entries(loadout.perLocation)) {
      for (let slot = usage.slotsUsed; slot < usage.slotsAvailable; slot++) {
        design.equipment.push({ equipmentId: 'case', location: location as Design['equipment'][number]['location'] });
      }
    }
    const original = structuredClone(design);
    const preview = evaluateWeaponReplacement(catalog, design, 0, 'machine_gun');
    expect(preview.ok).toBe(false);
    expect(preview.reason).toMatch(/ammunition|ammo/i);
    expect(design).toEqual(original);
  });

  it('revalidates stock and the original mount at confirmation', () => {
    const design = fixture();
    const stock = inventory(design, 'medium_laser');
    const request = { source: structuredClone(design), index: 0, weaponId: 'medium_laser' };
    stock.weapon.set('medium_laser', 0);
    expect(confirmWeaponReplacement(catalog, design, request, stock).nextDesign).toBeNull();
    stock.weapon.set('medium_laser', 1);
    design.mounts.splice(0, 1);
    const stale = confirmWeaponReplacement(catalog, design, request, stock);
    expect(stale.nextDesign).toBeNull();
    expect(stale.reason).toContain('loadout changed');
  });

  it('rejects a no-op swap and keeps an overweight candidate explicitly unsaveable', () => {
    const design = fixture();
    expect(evaluateWeaponReplacement(catalog, design, 0, 'machine_gun').ok).toBe(false);
    design.heatSinks = 50;
    const preview = evaluateWeaponReplacement(catalog, design, 0, 'medium_laser');
    expect(preview.ok).toBe(true);
    expect(preview.evaluation.report.valid).toBe(false);
    expect(preview.evaluation.report.loadout.freeTonnage).toBeLessThan(0);
  });
});
