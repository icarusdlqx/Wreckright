import type { DragEvent } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { catalog, legacySentinelDesign } from '../../../tests/support';
import { computeLoadout } from '../../sim/loadout';
import { fitByLocation } from './autoFit';
import { LocationCard, type DropPayload } from './LocationCard';
import { parsedDrop } from './dropPayload';
import { evaluateDrop } from './mechbayEdits';
import { payloadFootprint } from './SlotBoxes';
import { WeaponCard } from './WeaponCard';

function sentinel() {
  const design = legacySentinelDesign;
  const chassis = catalog.chassis.get('sentinel_snl2');
  if (design === undefined || chassis === undefined) throw new Error('Missing Sentinel');
  return { design: structuredClone(design), chassis };
}

function nativeDrop(raw: string): DragEvent<HTMLDivElement> {
  return {
    preventDefault: vi.fn(),
    dataTransfer: { getData: () => raw },
  } as unknown as DragEvent<HTMLDivElement>;
}

describe('visual fitting transactions', () => {
  it('rejects external and malformed drag data without interrupting the current draft', () => {
    const { design, chassis } = sentinel();
    const onDrop = vi.fn();
    const card = LocationCard({
      catalog, design, chassis, location: 'right_torso',
      usage: computeLoadout(catalog, design).perLocation.right_torso,
      onDrop, onRemoveMount: vi.fn(), onRemoveAmmo: vi.fn(), onRemoveEquipment: vi.fn(),
    });
    for (const raw of ['', '{', 'null', '[]', '{"kind":"file","id":"thing"}', '{"kind":"weapon","id":""}']) {
      expect(parsedDrop(raw)).toBeNull();
      expect(() => card.props.onDrop(nativeDrop(raw))).not.toThrow();
    }
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('checks the actual dropped weapon even when a different weapon was previously held', () => {
    const { design, chassis } = sentinel();
    const before = structuredClone(design);
    const accepted: string[] = [];
    const card = LocationCard({
      catalog, design, chassis, location: 'right_torso',
      usage: computeLoadout(catalog, design).perLocation.right_torso,
      armed: { kind: 'weapon', id: 'medium_laser' }, compatible: true,
      onDrop: (payload: DropPayload, location) => {
        const edit = evaluateDrop(catalog, design, payload, location);
        if (edit.status !== 'blocked') accepted.push(payload.id);
      },
      onRemoveMount: vi.fn(), onRemoveAmmo: vi.fn(), onRemoveEquipment: vi.fn(),
    });
    card.props.onDrop(nativeDrop('{"kind":"weapon","id":"gauss_rifle"}'));
    expect(accepted).toEqual([]);
    card.props.onDrop(nativeDrop('{"kind":"weapon","id":"medium_laser"}'));
    expect(accepted).toEqual(['medium_laser']);
    expect(design).toEqual(before);
  });

  it('shows the same seven-box Gauss footprint on the shelf and in a fitted location', () => {
    const weapon = catalog.weapons.get('gauss_rifle');
    if (weapon === undefined) throw new Error('Missing Gauss');
    const shelf = renderToStaticMarkup(createElement(WeaponCard, { catalog, weapon }));
    expect(shelf.match(/class="rack-cell"/g)).toHaveLength(7);
    expect(shelf).toContain('aria-label="7 fitting boxes"');
    expect(shelf).toContain('assault ballistic mount · 15t');
    const { design, chassis } = sentinel();
    design.mounts = [{ weaponId: weapon.id, location: 'right_arm' }];
    const fitted = renderToStaticMarkup(createElement(LocationCard, {
      catalog, design, chassis, location: 'right_arm',
      usage: computeLoadout(catalog, design).perLocation.right_arm,
      onDrop: vi.fn(), onRemoveMount: vi.fn(), onRemoveAmmo: vi.fn(), onRemoveEquipment: vi.fn(),
    }));
    expect(fitted.match(/class="rack-cell"/g)).toHaveLength(7);
    expect(fitted).toContain('aria-invalid="true"');
  });

  it('uses authored ammunition space instead of assuming every bin costs one box', () => {
    const modified = { ...catalog, rules: {
      ...catalog.rules, construction: { ...catalog.rules.construction, ammoSlotsPerTon: 2 },
    } };
    expect(payloadFootprint(modified, { kind: 'ammo', id: 'ac5' })).toBe(2);
  });

  it('warns about overweight including the first ammunition ton while preserving draft editing', () => {
    const { design } = sentinel();
    const fits = fitByLocation(catalog, design, { kind: 'weapon', id: 'machine_gun' });
    const target = fits.get('right_torso');
    expect(target?.ok).toBe(true);
    const expectedExcess = 1.5 - computeLoadout(catalog, design).freeTonnage;
    expect(expectedExcess).toBeGreaterThan(0);
    expect(target?.massWarning).toContain(`${expectedExcess.toFixed(1)}t over`);
    expect(target?.massWarning).toContain('Remove weight before saving');
  });
});
