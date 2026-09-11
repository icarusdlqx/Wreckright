import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { startCampaign } from '../../campaign/campaign';
import { marketListings, sellMech, buyMech } from '../../campaign/market';
import { canUndoSale, inspectYardListing, ownedPartFits, undoSale } from './supplyPresentation';
import { SupplyPartCard } from './SupplyPartCard';
import { MarketPanel } from './MarketPanel';

describe('supplies and yard decisions', () => {
  it('previews precisely the purchased condition without spending or changing the company', () => {
    const state = startCampaign(catalog, 'border_dispute', 'yard-inspection');
    const original = structuredClone(state);
    for (const listing of marketListings(catalog, state)) {
      const preview = inspectYardListing(catalog, state, listing);
      const purchase = structuredClone(state);
      purchase.cbills = Math.max(purchase.cbills, listing.price);
      expect(buyMech(catalog, purchase, listing.id).ok).toBe(true);
      expect(preview).toEqual(purchase.mechs.at(-1));
    }
    expect(state).toEqual(original);
  });

  it('shows compatible company machines and explains parts with no matching mount', () => {
    const state = startCampaign(catalog, 'border_dispute', 'parts-fit');
    const part = { kind: 'weapon' as const, id: 'gauss_rifle' };
    const results = ownedPartFits(catalog, state, part, true);
    expect(results.some(({ fit }) => !fit.ok)).toBe(true);
    for (const { mech, fit } of results) {
      if (!fit.ok) expect(fit.reason).toBeTruthy();
      expect(mech.status).toBe('ready');
    }
    const html = renderToStaticMarkup(createElement(SupplyPartCard, { catalog, state, part }));
    expect(html).toContain('slot-boxes');
    expect(html).toContain('Ammunition bin required');
    expect(html).toContain('No owned machine can fit this part');
    const fitting = renderToStaticMarkup(createElement(SupplyPartCard, {
      catalog, state, part: { kind: 'weapon', id: 'flamer' },
    }));
    expect(fitting).toContain('Owned fits:');
    expect(fitting).toContain('Bay 1');
  });

  it('restores the exact sold machine, fittings, seat and funds but never overwrites later company work', () => {
    const state = startCampaign(catalog, 'border_dispute', 'sale-undo');
    const before = structuredClone(state);
    const mech = state.mechs[0];
    if (mech === undefined) throw new Error('missing company machine');
    expect(sellMech(catalog, state, mech.id).ok).toBe(true);
    const receipt = { before, after: JSON.stringify(state), name: mech.design.name };
    expect(canUndoSale(state, receipt)).toBe(true);
    const later = structuredClone(state);
    later.day += 1;
    const preserved = structuredClone(later);
    expect(undoSale(later, receipt)).toBe(false);
    expect(later).toEqual(preserved);
    expect(undoSale(state, receipt)).toBe(true);
    expect(state).toEqual(before);
  });

  it('does not advertise a single foreign sink as enough to replace a complete cooling bank', () => {
    const state = startCampaign(catalog, 'border_dispute', 'cooling-fit');
    state.store = [{ kind: 'equipment', itemId: 'double_heat_sink', count: 1 }];
    const candidates = ownedPartFits(catalog, state, { kind: 'equipment', id: 'double_heat_sink' });
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every(({ fit }) => !fit.ok && fit.reason !== null)).toBe(true);
  });

  it('puts purchase controls behind visible condition and loadout inspection', () => {
    const state = startCampaign(catalog, 'border_dispute', 'yard-presentation');
    const html = renderToStaticMarkup(createElement(MarketPanel, { state, mutate: () => undefined }));
    expect(html).toMatch(/<details[^>]*market-inspect-[\s\S]*Included fittings[\s\S]*market-buy-/);
    expect(html).toContain('Review sale');
    expect(html).toContain('% intact');
  });
});
