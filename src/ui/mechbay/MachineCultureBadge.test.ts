import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import type { Faction } from '../../schema/faction';
import { MachineCultureBadge } from './MachineCultureBadge';
import {
  designUsesForeignComponents,
  foreignComponentPresentation,
} from './machineCulturePresentation';

function render(faction: Faction, foreignComponents = false): string {
  return renderToStaticMarkup(
    createElement(MachineCultureBadge, {
      faction,
      foreignComponents,
      showFitGuide: true,
    }),
  );
}

function renderDisclosure(expanded: boolean): string {
  return renderToStaticMarkup(
    createElement(MachineCultureBadge, {
      faction: 'aurelian',
      foreignComponents: true,
      testId: 'machine-culture-primary',
      expanded,
      onExpandedChange: () => undefined,
    }),
  );
}

describe('machine culture badge', () => {
  it('names both chassis cultures in text with an accessible group label', () => {
    const linewrought = render('linewrought');
    expect(linewrought).toContain('Linewrought');
    expect(linewrought).toContain('aria-label="Machine culture: Linewrought"');
    expect(linewrought).toContain('Patched armour, proven guns and field repairs');
    expect(linewrought).toContain('data-faction="linewrought"');

    const aurelian = render('aurelian');
    expect(aurelian).toContain('Aurelian Stock');
    expect(aurelian).toContain('aria-label="Machine culture: Aurelian Stock"');
    expect(aurelian).toContain('data-faction="aurelian"');
    expect(aurelian.match(/role="group"/g)).toHaveLength(1);
  });

  it('describes mixed-pattern parts as information rather than a prohibition', () => {
    const html = render('aurelian', true);
    expect(html).toContain('role="note"');
    expect(html).toContain('Captured weapons can fit compatible mounts');
    expect(html).toContain('Check the boxes');
    expect(html.toLowerCase()).not.toMatch(/forbidden|prohibited|cannot fit/);

    const foreign = foreignComponentPresentation('aurelian', 'linewrought');
    expect(foreign?.badge).toBe('Mixed refit');
    expect(foreign?.note).toContain('Both origins can be mixed');
    expect(foreignComponentPresentation('aurelian', 'aurelian')).toBeNull();
  });

  it('folds controlled culture details to one line and restores them on disclosure', () => {
    const collapsed = renderDisclosure(false);
    expect(collapsed).toContain('data-testid="machine-culture-primary"');
    expect(collapsed).toContain('data-testid="bay-culture-disclosure"');
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).toContain('Aurelian Stock');
    const controlledId = collapsed.match(/aria-controls="([^"]+)"/)?.[1];
    expect(controlledId).toBeDefined();
    expect(collapsed).toContain(
      `id="${controlledId}" class="machine-culture__details" hidden=""`,
    );

    const expanded = renderDisclosure(true);
    expect(expanded).toContain('aria-expanded="true"');
    expect(expanded).not.toContain('class="machine-culture__details" hidden=""');
    expect(expanded).toContain('Factory-refurbished armour and advanced energy weapons');
    expect(expanded).toContain('Mixed refit installed');
  });

  it('detects the actual mixed-pattern Sentinel fit without treating missing legacy ids as foreign', () => {
    const design = catalog.designs.get('sentinel_brawler');
    if (design === undefined) throw new Error('missing Sentinel design');
    expect(designUsesForeignComponents(catalog, design, 'aurelian')).toBe(true);

    expect(
      designUsesForeignComponents(
        catalog,
        {
          ...design,
          heatSinkId: 'double_heat_sink',
          mounts: [{ weaponId: 'missing_legacy_weapon', location: 'left_arm' }],
          equipment: [{ equipmentId: 'missing_legacy_gear', location: 'head' }],
        },
        'aurelian',
      ),
    ).toBe(false);
  });

  it('keeps compact copy wrapping and stacks it at the shared touch breakpoint', () => {
    const css = readFileSync(new URL('./machineCultureBadge.css', import.meta.url), 'utf8');
    const touchRules = css.slice(css.indexOf('@media (max-width: 900px)'));
    expect(css).toContain('overflow-wrap: anywhere;');
    expect(css).toMatch(/\.machine-culture--compact\s*{[^}]*flex-wrap: wrap;/s);
    expect(css).toContain('(pointer: coarse) and (max-width: 1100px)');
    expect(touchRules).toMatch(
      /\.machine-culture--compact\s*{[^}]*flex-direction: column;/s,
    );
    expect(touchRules).toMatch(
      /\.machine-culture__disclosure\s*{[^}]*min-height: 44px;/s,
    );
  });
});
