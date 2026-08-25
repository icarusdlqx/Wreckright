import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import type { Design } from '../../schema/design';
import { bestAmmoLocation, bestLocationFor, compatibleFrom, fitByLocation } from './autoFit';

function sentinel(): Design {
  const design = catalog.designs.get('sentinel_brawler');
  if (design === undefined) throw new Error('missing Sentinel fixture');
  return structuredClone(design);
}

describe('fit by location', () => {
  it('says nothing when the player is holding nothing', () => {
    expect(fitByLocation(catalog, sentinel(), null).size).toBe(0);
  });

  it('keeps a readable reason for every location that refused', () => {
    const design = sentinel();
    const fits = fitByLocation(catalog, design, { kind: 'weapon', id: 'gauss_rifle' });
    const refusals = [...fits.values()].filter((fit) => !fit.ok);

    expect(refusals.length).toBeGreaterThan(0);
    for (const refusal of refusals) {
      expect(refusal.reason).toBeTruthy();
      expect(refusal.reason).not.toBe('');
    }
  });

  it('reports no reason for a location that accepts the part', () => {
    const design = sentinel();
    const fits = fitByLocation(catalog, design, { kind: 'weapon', id: 'small_laser' });
    for (const location of compatibleFrom(fits)) {
      expect(fits.get(location)?.reason).toBeNull();
    }
  });
});

describe('choosing a berth', () => {
  it('prefers a bay that already carries a blowout cell', () => {
    const design = sentinel();
    // The Sentinel keeps its cell in the right torso; ammunition belongs beside it.
    expect(design.equipment.some((fit) => fit.equipmentId === 'case' && fit.location === 'right_torso'))
      .toBe(true);

    expect(bestAmmoLocation(catalog, design, ['left_arm', 'centre_torso', 'right_torso']))
      .toBe('right_torso');
  });

  it('puts ammunition anywhere before the centre torso or the head', () => {
    const design = sentinel();
    design.equipment = [];

    expect(bestAmmoLocation(catalog, design, ['centre_torso', 'left_leg'])).toBe('left_leg');
    expect(bestAmmoLocation(catalog, design, ['head', 'centre_torso'])).toBe('centre_torso');
  });

  it('has no berth to offer when nothing is on the list', () => {
    expect(bestAmmoLocation(catalog, sentinel(), [])).toBeNull();
  });

  it('packs a gun into the tightest bay that still takes it', () => {
    const design = sentinel();
    const payload = { kind: 'weapon', id: 'small_laser' } as const;
    const fits = fitByLocation(catalog, design, payload);
    const chosen = bestLocationFor(catalog, design, payload, fits);
    const candidates = compatibleFrom(fits);

    expect(candidates.length).toBeGreaterThan(0);
    expect(chosen).not.toBeNull();
    expect(candidates).toContain(chosen);
  });

  it('refuses to guess when no location would take the part', () => {
    const design = sentinel();
    const payload = { kind: 'weapon', id: 'gauss_rifle' } as const;
    const fits = new Map(
      [...fitByLocation(catalog, design, payload)].map(([location]) => [
        location,
        { ok: false, reason: 'no' },
      ]),
    );
    expect(bestLocationFor(catalog, design, payload, fits)).toBeNull();
  });
});
