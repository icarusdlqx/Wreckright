import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { compatibleDropLocations, evaluateDrop, installIntent } from './mechbayEdits';

function sentinel() {
  const design = catalog.designs.get('sentinel_brawler');
  if (design === undefined) throw new Error('missing Sentinel fixture');
  return structuredClone(design);
}

describe('mechbay drop transactions', () => {
  it('maps every shelf payload to an explicit edit intent', () => {
    expect(installIntent({ kind: 'weapon', id: 'medium_laser' }, 'right_torso')).toEqual({
      type: 'install_weapon', weaponId: 'medium_laser', location: 'right_torso',
    });
    expect(installIntent({ kind: 'ammo', id: 'srm6' }, 'left_torso')).toEqual({
      type: 'add_ammo', weaponId: 'srm6', location: 'left_torso',
    });
    expect(installIntent({ kind: 'equipment', id: 'case' }, 'left_torso')).toEqual({
      type: 'install_equipment', equipmentId: 'case', location: 'left_torso',
    });
  });

  it('offers separate bin locations after fitting an ammunition weapon', () => {
    const design = sentinel();
    const evaluation = evaluateDrop(
      catalog,
      design,
      { kind: 'weapon', id: 'machine_gun' },
      'right_torso',
    );

    expect(evaluation.status).toBe('needs_ammo');
    expect(evaluation.nextDesign.ammo).toEqual(design.ammo);
    expect(evaluation.continuation?.locations.length).toBeGreaterThan(1);
  });

  it('highlights valid ammo and equipment destinations instead of every location', () => {
    const design = sentinel();
    design.equipment.push(
      ...Array.from({ length: 4 }, () => ({ equipmentId: 'case', location: 'right_torso' as const })),
    );

    expect(
      compatibleDropLocations(catalog, design, { kind: 'equipment', id: 'case' }),
    ).not.toContain('right_torso');
    expect(
      compatibleDropLocations(catalog, design, { kind: 'ammo', id: 'srm6' }),
    ).not.toContain('right_torso');
  });
});
