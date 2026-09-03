import { describe, expect, it } from 'vitest';
import { refitAvailability, type RefitAvailability } from '../../campaign/refitQuote';
import type { StoreItem } from '../../campaign/types';
import type { Design } from '../../schema/design';
import { catalog } from '../../../tests/support';
import { evaluateEdit } from './editPreview';

function design(id = 'sentinel_brawler'): Design {
  const found = catalog.designs.get(id);
  if (found === undefined) throw new Error(`missing design ${id}`);
  return structuredClone(found);
}

function availability(original: Design, store: StoreItem[] = []): RefitAvailability {
  return refitAvailability({ store }, { design: original });
}

describe('weapon and ammunition edit previews', () => {
  it('continues an ammo-fed install with explicit valid bin locations', () => {
    const original = design();
    const before = JSON.stringify(original);
    const stock = availability(original, [
      { kind: 'weapon', itemId: 'machine_gun', count: 1 },
    ]);

    const result = evaluateEdit(catalog, original, {
      type: 'install_weapon',
      weaponId: 'machine_gun',
      location: 'right_torso',
    }, stock);

    expect(result.status).toBe('needs_ammo');
    expect(result.nextDesign.mounts).toContainEqual({
      weaponId: 'machine_gun',
      location: 'right_torso',
    });
    expect(result.nextDesign.ammo).toEqual(original.ammo);
    expect(result.report.issues).toContainEqual(expect.objectContaining({
      code: 'dry_weapon',
      component: 'weapon',
    }));
    expect(result.continuation).toEqual(expect.objectContaining({
      type: 'choose_ammo_location',
      weaponId: 'machine_gun',
      locations: expect.arrayContaining(['right_torso', 'left_leg']),
    }));
    expect(JSON.stringify(original)).toBe(before);

    const completed = evaluateEdit(catalog, result.nextDesign, {
      type: 'add_ammo',
      weaponId: 'machine_gun',
      location: 'left_leg',
    }, stock);
    expect(completed.status).toBe('applied');
    expect(completed.nextDesign.ammo).toContainEqual({
      weaponId: 'machine_gun',
      location: 'left_leg',
      tons: 1,
    });
    expect(completed.report.issues.some((issue) => issue.code === 'dry_weapon')).toBe(false);
  });

  it('lets duplicate same-ID mounts share one existing bin', () => {
    const original = design();
    const result = evaluateEdit(catalog, original, {
      type: 'install_weapon',
      weaponId: 'srm6',
      location: 'left_torso',
    }, availability(original, [{ kind: 'weapon', itemId: 'srm6', count: 1 }]));

    expect(result.status).toBe('applied');
    expect(result.nextDesign.mounts.filter((mount) => mount.weaponId === 'srm6')).toHaveLength(2);
    expect(result.nextDesign.ammo.filter((bin) => bin.weaponId === 'srm6')).toEqual([
      { weaponId: 'srm6', location: 'left_torso', tons: 1 },
    ]);
  });

  it('removes bins only when the last same-ID weapon leaves the draft', () => {
    const original = design();
    const removedLast = evaluateEdit(catalog, original, { type: 'remove_weapon', index: 0 });

    expect(removedLast.status).toBe('applied');
    expect(removedLast.nextDesign.mounts.some((mount) => mount.weaponId === 'ac5')).toBe(false);
    expect(removedLast.nextDesign.ammo.some((bin) => bin.weaponId === 'ac5')).toBe(false);
    expect(removedLast.deltas).toContainEqual({
      component: 'ammo',
      action: 'remove',
      before: { itemId: 'ac5', location: 'right_torso', quantity: 1 },
      after: null,
    });

    const duplicate = design();
    duplicate.mounts.push({ weaponId: 'ac5', location: 'right_torso' });
    const removedOne = evaluateEdit(catalog, duplicate, { type: 'remove_weapon', index: 0 });
    expect(removedOne.nextDesign.ammo.some((bin) => bin.weaponId === 'ac5')).toBe(true);
  });

  it('blocks energy and orphan ammo, then continues removal of the last shared bin', () => {
    const original = design();
    expect(evaluateEdit(catalog, original, {
      type: 'add_ammo', weaponId: 'medium_laser', location: 'left_torso',
    }).reasons).toContainEqual(expect.objectContaining({
      code: 'energy_ammo', scope: 'intent', component: 'ammo',
    }));
    expect(evaluateEdit(catalog, original, {
      type: 'add_ammo', weaponId: 'gauss_rifle', location: 'left_torso',
    }).reasons).toContainEqual(expect.objectContaining({
      code: 'orphan_ammo', scope: 'intent', component: 'ammo',
    }));
    const lastBin = evaluateEdit(catalog, original, {
      type: 'remove_ammo', weaponId: 'ac5', location: 'right_torso',
    });
    expect(lastBin.status).toBe('needs_ammo');
    expect(lastBin.reasons).toContainEqual(expect.objectContaining({
      code: 'needs_ammo', scope: 'continuation', component: 'ammo',
    }));
    expect(lastBin.continuation?.locations).toContain('right_torso');
  });

  it('previews weapon moves and replacements without changing the source', () => {
    const original = design();
    const before = JSON.stringify(original);
    const moved = evaluateEdit(catalog, original, {
      type: 'move_weapon', index: 1, location: 'right_torso',
    });
    expect(moved.status).toBe('applied');
    expect(moved.deltas).toContainEqual({
      component: 'weapon', action: 'move',
      before: { itemId: 'medium_laser', location: 'left_arm', quantity: 1 },
      after: { itemId: 'medium_laser', location: 'right_torso', quantity: 1 },
    });

    const replaced = evaluateEdit(catalog, original, {
      type: 'replace_weapon', index: 1, weaponId: 'er_medium_laser',
    }, availability(original, [
      { kind: 'weapon', itemId: 'er_medium_laser', count: 1 },
    ]));
    expect(replaced.status).toBe('applied');
    expect(replaced.nextDesign.mounts[1]).toEqual({
      weaponId: 'er_medium_laser', location: 'left_arm',
    });
    expect(JSON.stringify(original)).toBe(before);
  });
});

describe('blockers versus whole-machine draft issues', () => {
  it('blocks an impossible local hardpoint and returns an unchanged clone', () => {
    const original = design();
    const result = evaluateEdit(catalog, original, {
      type: 'install_weapon', weaponId: 'medium_laser', location: 'left_leg',
    });

    expect(result.status).toBe('blocked');
    expect(result.nextDesign).toEqual(original);
    expect(result.nextDesign).not.toBe(original);
    expect(result.reasons).toContainEqual(expect.objectContaining({
      code: 'hardpoint', scope: 'local', component: 'weapon',
      required: 1, available: 0, missing: 1,
    }));
  });

  it('keeps StoreItem kinds separate in exact stock blockers', () => {
    const original = design();
    const mounted = original.mounts.filter((mount) => mount.weaponId === 'medium_laser').length;
    const typed: RefitAvailability = {
      weapon: new Map([['medium_laser', mounted]]),
      equipment: new Map([['medium_laser', 99]]),
    };
    const result = evaluateEdit(catalog, original, {
      type: 'install_weapon', weaponId: 'medium_laser', location: 'right_torso',
    }, typed);

    expect(result.status).toBe('blocked');
    expect(result.reasons).toEqual([expect.objectContaining({
      code: 'stock', scope: 'stock', component: 'weapon', itemId: 'medium_laser',
      required: mounted + 1, available: mounted, missing: 1,
    })]);
  });

  it('applies an overweight edit but leaves the draft invalid for commit', () => {
    const original = design();
    const result = evaluateEdit(catalog, original, {
      type: 'install_weapon', weaponId: 'medium_laser', location: 'right_torso',
    }, availability(original, [
      { kind: 'weapon', itemId: 'medium_laser', count: 1 },
    ]));

    expect(result.status).toBe('applied');
    expect(result.reasons).toEqual([]);
    expect(result.report.valid).toBe(false);
    expect(result.report.issues).toContainEqual(expect.objectContaining({
      code: 'overweight', component: 'loadout',
    }));
  });
});

describe('equipment and cooling edit previews', () => {
  it('blocks ammo and gear in frame locations that cannot take damage', () => {
    const courser = design('courser_patrol');
    const ammo = evaluateEdit(catalog, courser, {
      type: 'add_ammo', weaponId: 'machine_gun', location: 'left_arm',
    });
    const redoubt = design('redoubt_emplacement');
    const gear = evaluateEdit(catalog, redoubt, {
      type: 'install_equipment', equipmentId: 'case', location: 'left_leg',
    });

    for (const result of [ammo, gear]) {
      expect(result.status).toBe('blocked');
      expect(result.reasons).toContainEqual(expect.objectContaining({
        code: 'location_slots',
        scope: 'local',
        available: 0,
      }));
    }
  });

  it('replaces and removes equipment, but rejects incompatible or misplaced gear', () => {
    const original = design();
    const replaced = evaluateEdit(catalog, original, {
      type: 'replace_equipment', index: 0, equipmentId: 'active_probe',
    }, availability(original, [
      { kind: 'equipment', itemId: 'active_probe', count: 1 },
    ]));
    expect(replaced.status).toBe('applied');
    // The stock Sentinel carries a blowout cell in each side torso; only the
    // first is replaced, and removing it leaves the other where it was.
    expect(replaced.nextDesign.equipment).toEqual([
      { equipmentId: 'active_probe', location: 'right_torso' },
      { equipmentId: 'case', location: 'left_torso' },
    ]);
    expect(evaluateEdit(catalog, replaced.nextDesign, {
      type: 'remove_equipment', index: 0,
    }).nextDesign.equipment).toEqual([{ equipmentId: 'case', location: 'left_torso' }]);

    expect(evaluateEdit(catalog, original, {
      type: 'install_equipment', equipmentId: 'jump_jet', location: 'left_leg',
    }).reasons).toContainEqual(expect.objectContaining({
      code: 'jump_jets', scope: 'local', component: 'equipment',
    }));
    expect(evaluateEdit(catalog, original, {
      type: 'install_equipment', equipmentId: 'heat_sink', location: 'left_leg',
    }).reasons).toContainEqual(expect.objectContaining({
      code: 'cooling_only', scope: 'intent', component: 'equipment',
    }));
  });

  it('uses typed equipment stock for cooling and exposes under-sinking as a draft issue', () => {
    const original = design();
    const switched = evaluateEdit(catalog, original, {
      type: 'set_cooling', heatSinkId: 'double_heat_sink', heatSinks: 10,
    }, availability(original, [
      { kind: 'equipment', itemId: 'double_heat_sink', count: 10 },
    ]));
    expect(switched.status).toBe('applied');
    expect(switched.deltas).toEqual([{
      component: 'cooling', action: 'change',
      before: { itemId: 'heat_sink', location: null, quantity: 10 },
      after: { itemId: 'double_heat_sink', location: null, quantity: 10 },
    }]);

    const underSinked = evaluateEdit(catalog, original, {
      type: 'set_cooling', heatSinks: 9,
    }, availability(original));
    expect(underSinked.status).toBe('applied');
    expect(underSinked.report.issues).toContainEqual(expect.objectContaining({
      code: 'heat_sinks', component: 'heat_sink',
    }));

    const shortage = evaluateEdit(catalog, original, {
      type: 'set_cooling', heatSinkId: 'double_heat_sink', heatSinks: 10,
    }, availability(original, [
      { kind: 'equipment', itemId: 'double_heat_sink', count: 9 },
    ]));
    expect(shortage.status).toBe('blocked');
    expect(shortage.reasons).toContainEqual(expect.objectContaining({
      code: 'stock', scope: 'stock', component: 'cooling',
      itemId: 'double_heat_sink', required: 10, available: 9, missing: 1,
    }));
  });
});
