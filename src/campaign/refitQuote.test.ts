import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import type { Design } from '../schema/design';
import {
  quoteRefit,
  refitAvailability,
  settleRefitQuote,
} from './refitQuote';
import type { StoreItem } from './types';

function designOf(id = 'sentinel_brawler'): Design {
  const design = catalog.designs.get(id);
  if (design === undefined) throw new Error(`missing design ${id}`);
  return structuredClone(design);
}

describe('refit quotes', () => {
  it('reports every exact weapon, equipment, and heat-sink shortage at once', () => {
    const original = designOf();
    const next = structuredClone(original);
    next.mounts.push(
      { weaponId: 'gauss_rifle', location: 'right_arm' },
      { weaponId: 'gauss_rifle', location: 'left_arm' },
    );
    next.equipment.push({ equipmentId: 'active_probe', location: 'left_torso' });
    next.heatSinkId = 'double_heat_sink';
    next.heatSinks += 1;

    const state = {
      store: [
        { kind: 'weapon', itemId: 'gauss_rifle', count: 1 },
        { kind: 'equipment', itemId: 'double_heat_sink', count: next.heatSinks - 2 },
      ] satisfies StoreItem[],
    };
    const before = JSON.stringify({ state, original, next });
    const quote = quoteRefit(state, original, next);

    expect(quote.ok).toBe(false);
    expect(quote.shortages).toEqual([
      {
        kind: 'equipment',
        itemId: 'active_probe',
        count: 1,
        role: 'equipment',
        available: 0,
        missing: 1,
      },
      {
        kind: 'equipment',
        itemId: 'double_heat_sink',
        count: next.heatSinks,
        role: 'heat_sink',
        available: next.heatSinks - 2,
        missing: 2,
      },
      {
        kind: 'weapon',
        itemId: 'gauss_rifle',
        count: 2,
        role: 'weapon',
        available: 1,
        missing: 1,
      },
    ]);
    expect(JSON.stringify({ state, original, next })).toBe(before);
  });

  it('never pays a weapon shortage with a same-id equipment crate', () => {
    const original = designOf();
    const next = structuredClone(original);
    next.mounts.push({ weaponId: 'gauss_rifle', location: 'right_arm' });
    const state = {
      store: [
        { kind: 'equipment', itemId: 'gauss_rifle', count: 20 },
      ] satisfies StoreItem[],
    };

    const quote = quoteRefit(state, original, next);

    expect(quote.shortages).toEqual([
      expect.objectContaining({
        kind: 'weapon',
        itemId: 'gauss_rifle',
        available: 0,
        missing: 1,
      }),
    ]);
  });

  it('keeps same-id availability separate by StoreItem kind', () => {
    const design = designOf();
    const mounted = design.mounts.filter((mount) => mount.weaponId === 'medium_laser').length;
    const availability = refitAvailability(
      {
        store: [
          { kind: 'weapon', itemId: 'medium_laser', count: 2 },
          { kind: 'equipment', itemId: 'medium_laser', count: 7 },
        ],
      },
      { design },
    );

    expect(availability.weapon.get('medium_laser')).toBe(mounted + 2);
    expect(availability.equipment.get('medium_laser')).toBe(7);
    expect(availability.equipment.get(design.heatSinkId)).toBe(design.heatSinks);
  });

  it('does not quote workshop-supplied ammunition as store stock', () => {
    const original = designOf();
    const next = structuredClone(original);
    next.ammo.push({ weaponId: 'ac5', location: 'left_torso', tons: 3 });

    const quote = quoteRefit({ store: [] }, original, next);

    expect(quote).toMatchObject({ ok: true, consumed: [], returned: [], shortages: [] });
  });

  it('settles on a clone and rolls back a stale quote without partial consumption', () => {
    const original = designOf();
    const next = structuredClone(original);
    next.mounts.push({ weaponId: 'gauss_rifle', location: 'right_arm' });
    next.equipment.push({ equipmentId: 'active_probe', location: 'left_torso' });
    const quotedStore: StoreItem[] = [
      { kind: 'weapon', itemId: 'gauss_rifle', count: 1 },
      { kind: 'equipment', itemId: 'active_probe', count: 1 },
    ];
    const quote = quoteRefit({ store: quotedStore }, original, next);
    expect(quote.ok).toBe(true);

    const staleStore = quotedStore.slice(0, 1);
    const before = JSON.stringify(staleStore);
    expect(settleRefitQuote(staleStore, quote)).toBeNull();
    expect(JSON.stringify(staleStore)).toBe(before);

    const settled = settleRefitQuote(quotedStore, quote);
    expect(settled).toEqual([]);
    expect(quotedStore).toEqual([
      { kind: 'weapon', itemId: 'gauss_rifle', count: 1 },
      { kind: 'equipment', itemId: 'active_probe', count: 1 },
    ]);
  });
});
