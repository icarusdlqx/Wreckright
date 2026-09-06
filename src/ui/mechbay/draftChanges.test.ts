import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { beginDesignHistory, pushDesign, undoDesign } from './designHistory';
import { designHasChanges } from './draftChanges';
import { DraftExitDialog } from './useDraftExit';

describe('unsaved refit protection', () => {
  it('detects weapon removal and armour edits, but does not block an undone or untouched refit', () => {
    const design = catalog.designs.get('hornet_spotter');
    if (design === undefined) throw new Error('missing Gadfly');
    const removed = structuredClone(design);
    removed.mounts.pop();
    expect(designHasChanges(design, removed)).toBe(true);
    const history = pushDesign(beginDesignHistory(design), removed);
    expect(designHasChanges(design, undoDesign(history).present)).toBe(false);
    const armour = structuredClone(design);
    armour.armour.left_arm -= 1;
    expect(designHasChanges(design, armour)).toBe(true);
    expect(designHasChanges(design, structuredClone(design))).toBe(false);
  });

  it('keeps editing and discarding available when a draft cannot be saved', () => {
    const html = renderToStaticMarkup(createElement(DraftExitDialog, {
      saveable: false, onSave: () => undefined, onDiscard: () => undefined, onKeep: () => undefined,
    }));
    expect(html).toContain('Keep editing');
    expect(html).toContain('Discard changes');
    expect(html).toMatch(/disabled="" data-testid="bay-unsaved-save"/);
  });
});
