import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { shelfFit, swapFit } from './shelfFit';

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

describe('swap fit', () => {
  const design = catalog.designs.get('sentinel_brawler');
  if (design === undefined) throw new Error('missing Sentinel fixture');
  const swap = { index: 0, location: 'right_arm' as const, weaponId: 'ac5' };

  it('counts the outgoing gun as free room and stows the replacement ammunition', () => {
    // The arm has one ballistic mount and the AC/5 is in it; a straight install
    // would be refused, a swap is not.
    expect(shelfFit(catalog, design, { kind: 'weapon', id: 'machine_gun' }, undefined, 'right_arm').ok)
      .toBe(false);
    const fit = swapFit(catalog, design, swap, 'machine_gun', undefined);
    expect(fit.ok).toBe(true);
    expect(fit.reason).toContain('ammunition is stowed');
  });

  it('still refuses a gun the mount was not built for', () => {
    const wrongType = swapFit(catalog, design, swap, 'medium_laser', undefined);
    expect(wrongType.ok).toBe(false);
    expect(wrongType.reason).toContain('energy');

    const tooWide = swapFit(catalog, design, swap, 'lbx_ac10', undefined);
    expect(tooWide.ok).toBe(false);
    expect(tooWide.reason).toContain('slot');
  });
});
