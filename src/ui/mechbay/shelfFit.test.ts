import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { shelfFit } from './shelfFit';

function sentinel() {
  const design = catalog.designs.get('sentinel_brawler');
  if (design === undefined) throw new Error('missing Sentinel fixture');
  return structuredClone(design);
}

describe('mechbay shelf fit', () => {
  it('describes installed zero-spare gear before unrelated location errors', () => {
    const design = sentinel();
    const stock = { weapon: new Map([['medium_laser', 3]]), equipment: new Map([['case', 1]]) };
    for (const selectedLocation of [null, 'left_arm'] as const) {
      const fit = shelfFit(catalog, design, { kind: 'weapon', id: 'medium_laser' }, stock, selectedLocation);
      expect(fit.ok).toBe(false);
      expect(fit.label).toBe('Installed');
      expect(fit.reason).toContain('0 spare');
      expect(fit.reason).not.toContain('no energy');
    }
    expect(shelfFit(catalog, design, { kind: 'equipment', id: 'case' }, stock, null).label).toBe('Installed');
  });

  it('keeps replacement-only weapons discoverable when the selected mounts are full', () => {
    const design = sentinel();
    const fit = shelfFit(catalog, design, { kind: 'weapon', id: 'er_medium_laser' }, undefined, 'left_arm');
    expect(fit).toMatchObject({ ok: true, label: 'Replace', replacementOnly: true });
    expect(fit.reason).toContain('installed weapon');
  });

  it('reports a relevant machine-wide refusal rather than the first Head refusal', () => {
    const fit = shelfFit(catalog, sentinel(), { kind: 'weapon', id: 'gauss_rifle' }, undefined, null);
    expect(fit.ok).toBe(false);
    expect(fit.reason).toContain('none on this machine is large enough');
    expect(fit.reason).not.toContain('This part has no');
  });

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
      reason: 'Fits here. One ton of ammunition will be stowed automatically.',
    });
  });
});
