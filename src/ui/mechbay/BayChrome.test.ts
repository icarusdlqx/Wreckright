import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { BayChrome } from './BayChrome';

function renderHistory(
  history: {
    canUndo?: boolean;
    canRedo?: boolean;
    onUndo?: () => void;
    onRedo?: () => void;
    commissionTitle?: string;
  } = {},
): string {
  const design = catalog.designs.get('sentinel_brawler');
  if (design === undefined) throw new Error('missing Sentinel design');

  return renderToStaticMarkup(
    createElement(BayChrome, {
      catalog,
      design,
      stored: [],
      saveable: true,
      status: null,
      muted: false,
      onNameChange: () => undefined,
      onDesignPick: () => undefined,
      onReset: () => undefined,
      onToggleMuted: () => undefined,
      onExit: () => undefined,
      onSave: () => undefined,
      onExport: () => undefined,
      onImport: () => undefined,
      onLoad: () => undefined,
      ...history,
    }),
  );
}

describe('mechbay history controls', () => {
  it('keeps backward-compatible controls disabled when no history is supplied', () => {
    const html = renderHistory();

    expect(html).toMatch(
      /<button type="button" disabled="" title="Nothing to undo" data-testid="bay-undo">Undo<\/button>/,
    );
    expect(html).toMatch(
      /<button type="button" disabled="" title="Nothing to redo" data-testid="bay-redo">Redo<\/button>/,
    );
  });

  it('enables only available actions with handlers and places them beside reset', () => {
    const html = renderHistory({
      canUndo: true,
      canRedo: false,
      onUndo: () => undefined,
      onRedo: () => undefined,
    });

    expect(html).toMatch(
      /<button type="button" title="Undo the last loadout change" data-testid="bay-undo">Undo<\/button>/,
    );
    expect(html).toMatch(/data-testid="bay-redo"[^>]*disabled=""|disabled=""[^>]*data-testid="bay-redo"/);
    expect(html.indexOf('data-testid="bay-undo"')).toBeLessThan(
      html.indexOf('data-testid="bay-redo"'),
    );
    expect(html.indexOf('data-testid="bay-redo"')).toBeLessThan(
      html.indexOf('data-testid="bay-reset-stock"'),
    );
  });

  it('does not enable an advertised action without a callback', () => {
    const html = renderHistory({ canUndo: true, canRedo: true });

    expect(html).toMatch(/data-testid="bay-undo"[^>]*disabled=""|disabled=""[^>]*data-testid="bay-undo"/);
    expect(html).toMatch(/data-testid="bay-redo"[^>]*disabled=""|disabled=""[^>]*data-testid="bay-redo"/);
  });

  it('offers loadout selection and naming only in the standalone workshop', () => {
    const standalone = renderHistory();
    const commissioned = renderHistory({ commissionTitle: 'Field refit' });

    expect(standalone).toContain('aria-label="Design name"');
    expect(standalone).toContain('aria-label="Stock design"');
    expect(standalone).toContain('Save loadout');
    expect(standalone).toContain('aria-label="Saved loadouts"');
    expect(standalone).not.toContain('Build Linewrought');
    expect(standalone).not.toContain('shopbuilt');
    expect(commissioned).toContain('data-testid="bay-commission"');
    expect(commissioned).toContain('Commit refit');
    expect(commissioned).not.toContain('aria-label="Design name"');
    expect(commissioned).not.toContain('aria-label="Stock design"');
    expect(commissioned).not.toContain('aria-label="Saved loadouts"');
  });

  it('selects authored mech loadouts without offering vehicles or emplacements', () => {
    const standalone = renderHistory();

    expect(standalone).toContain('Gadfly GAD-2 &#x27;Spotter&#x27;');
    expect(standalone).toContain('Sentinel SNL-2 &#x27;Brawler&#x27;');
    expect(standalone).not.toContain('Courser CRS-1 &#x27;Patrol&#x27;');
    expect(standalone).not.toContain('Redoubt RDT-1 &#x27;Emplacement&#x27;');
  });
});
