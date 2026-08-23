import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { compatibleLocations } from './bayFit';
import { beginDesignHistory } from './designHistory';
import { createLinewroughtDraft } from './linewroughtBuilderModel';
import { guidedWeaponId, Mechbay } from './Mechbay';

describe('campaign cooling inventory', () => {
  it('shows an unavailable heat-sink type without allowing it to be selected', () => {
    const design = catalog.designs.get('sentinel_brawler');
    if (design === undefined) throw new Error('missing Sentinel design');

    const html = renderToStaticMarkup(
      createElement(Mechbay, {
        onExit: () => undefined,
        commission: {
          title: design.name,
          cancelLabel: 'Back to hangar',
          design,
          inventory: {
            weapon: new Map(),
            equipment: new Map([[design.heatSinkId, design.heatSinks]]),
          },
          onCommit: () => ({ ok: true, reason: null }),
          onCancel: () => undefined,
        },
      }),
    );

    expect(html).toContain('Heat Sink');
    expect(html).toMatch(/<option[^>]+disabled=""[^>]*>Compound Heat Sink · 0 available<\/option>/);
    expect(html).toContain('Back to hangar');
    expect(html).not.toContain('data-testid="linewrought-builder-open"');
    expect(html).not.toContain('Build Linewrought');
  });
});

describe('mechbay presentation', () => {
  it('uses the expanding mobile workspace on coarse tablets without changing fine-pointer 1024px', () => {
    const css = readFileSync(new URL('./mechbayWorkspaceLayout.css', import.meta.url), 'utf8');
    const mobileQuery =
      '@media (max-width: 760px), (pointer: coarse) and (max-width: 1100px)';
    const mobileRules = css.slice(css.indexOf(mobileQuery));

    expect(css).toContain(mobileQuery);
    expect(css).toContain('@media (min-width: 761px) and (max-width: 1180px)');
    expect(mobileRules).toMatch(
      /\.bay-workspace-panel--loadout\s*{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?overflow: visible;/,
    );
  });

  it('keeps the armed weapon guidance while another card is hovered', () => {
    const design = catalog.designs.get('sentinel_brawler');
    if (design === undefined) throw new Error('missing Sentinel design');

    const weaponId = guidedWeaponId(
      { kind: 'weapon', id: 'medium_laser' },
      'ac5',
    );

    expect(compatibleLocations(catalog, design, 'ac5')).toEqual([]);
    expect(weaponId).toBe('medium_laser');
    expect(compatibleLocations(catalog, design, weaponId ?? '')).toEqual(['right_torso']);
  });

  it('renders the live preview, selectable locations, and compact inspected catalog', () => {
    const html = renderToStaticMarkup(
      createElement(Mechbay, { onExit: () => undefined }),
    );

    expect(html).toContain('data-testid="mech-preview"');
    expect(html.match(/class="bay-location-name"/g)).toHaveLength(8);
    expect(html).toContain('Long-Range Missiles');
    expect(html).toContain('Machine Guns');
    expect(html).toContain('Lasers');
    expect(html).toContain('data-testid="machine-culture-primary"');
    expect(html).toContain('data-testid="machine-culture-shelf"');
    expect(html).toContain('Aurelian Stock — Sealed');
    expect(html).toContain('Mixed-pattern fit installed');
    expect(html).toContain('Culture is informational; mount, slots, tonnage, and stock decide fit.');
    expect(html).toContain('Linewrought');
    expect(html).toContain('data-testid="shelf-search"');
    expect(html).toContain('data-testid="shelf-family"');
    expect(html).toContain('data-testid="linewrought-builder-open"');
    expect(html).toContain('weapon-card--compact');
    expect(html.match(/id="bay-shelf-inspector"/g)).toHaveLength(1);
    expect(html.match(/role="meter"/g)).toHaveLength(3);
    expect(html.match(/data-workspace-tab=/g)).toHaveLength(3);
    expect(html.match(/data-workspace-panel=/g)).toHaveLength(3);
    for (const workspace of ['loadout', 'armour', 'review']) {
      expect(html).toContain(`aria-controls="bay-workspace-panel-${workspace}"`);
      expect(html).toContain(`id="bay-workspace-panel-${workspace}"`);
    }
    expect(html).toMatch(/id="bay-workspace-panel-loadout"[^>]*role="tabpanel"(?![^>]*hidden="")/);
    expect(html).toMatch(/id="bay-workspace-panel-armour"[^>]*hidden=""/);
    expect(html).toMatch(/id="bay-workspace-panel-review"[^>]*hidden=""/);
    expect(html).not.toMatch(/dead inside|Lobs over cover/);
  });

  it('routes a builder draft through the full-design replacement reset', () => {
    const source = readFileSync(new URL('./Mechbay.tsx', import.meta.url), 'utf8');
    const replaceStart = source.indexOf('const replace = (next: Design): void => {');
    const replaceEnd = source.indexOf('const navigateHistory', replaceStart);
    const replaceBlock = source.slice(replaceStart, replaceEnd);

    expect(replaceStart).toBeGreaterThan(-1);
    expect(replaceEnd).toBeGreaterThan(replaceStart);
    expect(source).toContain('onDesignPick={replace}');
    expect(replaceBlock).toContain('setSelectedLocation(null)');
    expect(replaceBlock).toContain('setHoveredLocation(null)');
    expect(replaceBlock).toContain('setArmed(null)');
    expect(replaceBlock).toContain('setInspected(null)');
    expect(replaceBlock).toContain("setWorkspace('loadout')");
    expect(replaceBlock).toContain('setHistory(beginDesignHistory(next))');

    const created = createLinewroughtDraft(catalog, {
      chassisId: 'hornet_hnt2',
      mode: 'bare',
      name: 'Gantry Test',
    });
    const replacedHistory = beginDesignHistory(created);
    expect(replacedHistory.present).toEqual(created);
    expect(replacedHistory.past).toEqual([]);
    expect(replacedHistory.future).toEqual([]);
  });

  it('routes name and armour streams through coalesced history transactions', () => {
    const source = readFileSync(new URL('./Mechbay.tsx', import.meta.url), 'utf8');

    expect(source).toContain("previewDraft('name', setName(design, name))");
    expect(source).toContain('onApply={commitDraft}');
    expect(source).toContain("onPreview={(next) => previewDraft('armour', next)}");
    expect(source).toContain("finishDesignTransaction(current, 'armour')");
    expect(source).not.toContain('present: cloneDesign(next)');
  });

  it('updates the culture identity in both selected-chassis contexts', () => {
    const design = catalog.designs.get('bulwark_assault');
    if (design === undefined) throw new Error('missing Bulwark design');

    const html = renderToStaticMarkup(
      createElement(Mechbay, {
        onExit: () => undefined,
        commission: {
          title: design.name,
          design,
          onCommit: () => ({ ok: true, reason: null }),
          onCancel: () => undefined,
        },
      }),
    );

    expect(
      html.match(
        /<span class="machine-culture__badge">Linewrought — Shopbuilt<\/span>/g,
      ),
    ).toHaveLength(2);
    expect(html).toContain('aria-label="Machine culture: Linewrought — Shopbuilt"');
    expect(html).toContain('data-faction="linewrought"');
  });
});
