import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { parsedDrop } from './dropPayload';
import { evaluateDrop } from './mechbayEdits';
import { RackCapacity } from './RackCapacity';
import { slotBoxColumns, SlotBoxes } from './SlotBoxes';
import { buildLocationOccupants } from './locationOccupants';
import { WeaponCard } from './WeaponCard';
import { beginDesignHistory, pushDesign, undoDesign } from './designHistory';

const sentinel = catalog.designs.get('sentinel_brawler')!;

describe('two dimensional fitting racks', () => {
  it('draws exact slot counts in compact regular groups without inflating five or seven box weapons', () => {
    for (let count = 1; count <= 16; count++) {
      const html = renderToStaticMarkup(createElement(SlotBoxes, { count }));
      expect((html.match(/class="rack-cell"/g) ?? []).length).toBe(count);
      expect(slotBoxColumns(count)).toBeLessThanOrEqual(4);
      if (count >= 4) expect(slotBoxColumns(count)).toBeLessThan(count);
    }
  });

  it('shows the complete compartment, differentiates ammo, and previews only free boxes', () => {
    const { occupants } = buildLocationOccupants(catalog, sentinel, 'left_torso', 3);
    const html = renderToStaticMarkup(createElement(RackCapacity, { capacity: 6, occupants, incoming: 2 }));
    expect((html.match(/class="rack-cell /g) ?? []).length).toBe(6);
    expect((html.match(/rack-cell--incoming/g) ?? []).length).toBe(2);
    expect(html).toContain('tone-ammo');
    expect(html).toContain('3 occupied and 3 free fitting boxes');
  });

  it('makes ammo-fed and energy weapons explicit before a player picks one', () => {
    const ac = renderToStaticMarkup(createElement(WeaponCard, { catalog, weapon: catalog.weapons.get('ac5')! }));
    expect(ac).toContain('Ammo required');
    expect(ac).toContain('First bin fitted automatically');
    const laser = renderToStaticMarkup(createElement(WeaponCard, { catalog, weapon: catalog.weapons.get('medium_laser')! }));
    expect(laser).toContain('No ammo needed');
    const shared = renderToStaticMarkup(createElement(WeaponCard, { catalog, weapon: catalog.weapons.get('ac5')!, ammoTons: 2 }));
    expect(shared).toContain('rounds shared on this mech');
  });
});

describe('moving installed weapons', () => {
  const laserIndex = sentinel.mounts.findIndex((mount) => mount.weaponId === 'medium_laser' && mount.location === 'left_arm');
  const payload = { kind: 'weapon' as const, id: 'medium_laser', sourceIndex: laserIndex };
  it('validates the native relocation payload and ignores forged indices or equipment sources', () => {
    expect(parsedDrop(JSON.stringify(payload))).toEqual(payload);
    for (const sourceIndex of [-1, 0.5, '0', null]) expect(parsedDrop(JSON.stringify({ ...payload, sourceIndex }))).toBeNull();
    expect(parsedDrop(JSON.stringify({ ...payload, kind: 'ammo' }))).toBeNull();
  });

  it('relocates one existing copy without consuming spares, changing ammo or losing undo', () => {
    const available = { weapon: new Map<string, number>(), equipment: new Map<string, number>() };
    const moved = evaluateDrop(catalog, sentinel, payload, 'right_torso', available);
    expect(moved.status).toBe('applied');
    expect(moved.nextDesign.mounts).toHaveLength(sentinel.mounts.length);
    expect(moved.nextDesign.mounts[laserIndex]?.location).toBe('right_torso');
    expect(moved.nextDesign.ammo).toEqual(sentinel.ammo);
    expect(sentinel.mounts[laserIndex]?.location).toBe('left_arm');
    expect(undoDesign(pushDesign(beginDesignHistory(sentinel), moved.nextDesign)).present).toEqual(sentinel);
  });

  it('rejects an incompatible destination and a stale index without changing the fit', () => {
    const blocked = evaluateDrop(catalog, sentinel, payload, 'head');
    expect(blocked.status).toBe('blocked');
    expect(blocked.nextDesign).toEqual(sentinel);
    const stale = evaluateDrop(catalog, sentinel, { ...payload, id: 'ac5' }, 'right_torso');
    expect(stale.status).toBe('blocked');
    expect(stale.nextDesign).toEqual(sentinel);
  });
});
