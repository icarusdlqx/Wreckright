import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { isolateModalBackground, OutfitBayDialog } from './OutfitBayDialog';

interface FakeElement {
  inert: boolean;
  parentElement: { children: FakeElement[] } | null;
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
}

function fakeElement(inert = false, ariaHidden: string | null = null): FakeElement {
  const attributes = new Map<string, string>();
  if (ariaHidden !== null) attributes.set('aria-hidden', ariaHidden);
  return {
    inert,
    parentElement: null,
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => { attributes.set(name, value); },
    removeAttribute: (name) => { attributes.delete(name); },
  };
}

describe('skirmish outfit dialog', () => {
  it('uses modal semantics and an accessible commission name', () => {
    const design = catalog.designs.get('sentinel_brawler');
    if (design === undefined) throw new Error('missing Sentinel design');
    const html = renderToStaticMarkup(createElement(OutfitBayDialog, {
      bay: {
        title: 'Berth 1',
        design,
        onCommit: () => ({ ok: true, reason: null }),
        onCancel: () => undefined,
      },
      onClose: () => undefined,
    }));

    expect(html).toContain('data-testid="outfit-bay"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Refit Berth 1"');
    expect(html).toContain('tabindex="-1"');

    const source = readFileSync(new URL('./OutfitBayDialog.tsx', import.meta.url), 'utf8');
    expect(source).toContain('useDialogFocus(dialogRef, dialogRef, onClose)');
    expect(source.indexOf('useModalBackgroundIsolation(backdropRef)')).toBeLessThan(
      source.indexOf('useDialogFocus(dialogRef, dialogRef, onClose)'),
    );

    const battleSource = readFileSync(new URL('./Battle.tsx', import.meta.url), 'utf8');
    expect(battleSource).toContain('const closeOutfitBay = useCallback');
    expect(battleSource).toContain('onCancel: closeOutfitBay');
    expect(battleSource).toContain('onClose={closeOutfitBay}');
  });

  it('isolates every background sibling and restores its prior state', () => {
    const first = fakeElement(false, null);
    const backdrop = fakeElement();
    const alreadyHidden = fakeElement(true, 'menu-state');
    backdrop.parentElement = { children: [first, backdrop, alreadyHidden] };

    const restore = isolateModalBackground(backdrop as unknown as HTMLElement);
    expect(first.inert).toBe(true);
    expect(first.getAttribute('aria-hidden')).toBe('true');
    expect(alreadyHidden.inert).toBe(true);
    expect(alreadyHidden.getAttribute('aria-hidden')).toBe('true');

    restore();
    expect(first.inert).toBe(false);
    expect(first.getAttribute('aria-hidden')).toBeNull();
    expect(alreadyHidden.inert).toBe(true);
    expect(alreadyHidden.getAttribute('aria-hidden')).toBe('menu-state');
  });
});
