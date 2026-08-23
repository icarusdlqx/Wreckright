import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { shelfFit } from './shelfFit';

function sentinel() {
  const design = catalog.designs.get('sentinel_brawler');
  if (design === undefined) throw new Error('missing Sentinel fixture');
  return structuredClone(design);
}

describe('mechbay shelf fit', () => {
  it('uses the same transaction rules for weapons, bins, and gear', () => {
    const design = sentinel();
    design.equipment.push(
      ...Array.from({ length: 4 }, () => ({ equipmentId: 'case', location: 'right_torso' as const })),
    );

    expect(shelfFit(
      catalog, design, { kind: 'weapon', id: 'medium_laser' }, undefined, 'right_torso',
    ).ok).toBe(false);
    expect(shelfFit(
      catalog, design, { kind: 'ammo', id: 'srm6' }, undefined, 'right_torso',
    ).ok).toBe(false);
    expect(shelfFit(
      catalog, design, { kind: 'equipment', id: 'case' }, undefined, 'right_torso',
    ).ok).toBe(false);
  });

  it('explains the separate-bin continuation for ammo-fed guns', () => {
    const fit = shelfFit(
      catalog,
      sentinel(),
      { kind: 'weapon', id: 'machine_gun' },
      undefined,
      'right_torso',
    );
    expect(fit).toEqual({
      ok: true,
      reason: 'Weapon fits here. Choose a separate ammunition-bin location next.',
    });
  });
});
