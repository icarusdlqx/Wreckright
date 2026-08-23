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

describe('machine culture badge', () => {
  it('names both chassis cultures in text with an accessible group label', () => {
    const linewrought = render('linewrought');
    expect(linewrought).toContain('Linewrought — Shopbuilt');
    expect(linewrought).toContain('aria-label="Machine culture: Linewrought — Shopbuilt"');
    expect(linewrought).toContain('data-faction="linewrought"');

    const aurelian = render('aurelian');
    expect(aurelian).toContain('Aurelian Stock — Sealed');
    expect(aurelian).toContain('aria-label="Machine culture: Aurelian Stock — Sealed"');
    expect(aurelian).toContain('data-faction="aurelian"');
    expect(aurelian.match(/role="group"/g)).toHaveLength(1);
  });

  it('describes mixed-pattern parts as information rather than a prohibition', () => {
    const html = render('aurelian', true);
    expect(html).toContain('role="note"');
    expect(html).toContain('Foreign components are allowed');
    expect(html).toContain('mount, slots, tonnage, and stock still decide fit');
    expect(html.toLowerCase()).not.toMatch(/forbidden|prohibited|cannot fit/);

    const foreign = foreignComponentPresentation('aurelian', 'linewrought');
    expect(foreign?.badge).toBe('Foreign pattern — origin only');
    expect(foreign?.note).toContain('Culture is informational');
    expect(foreignComponentPresentation('aurelian', 'aurelian')).toBeNull();
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
    expect(css).toContain('overflow-wrap: anywhere;');
    expect(css).toMatch(/\.machine-culture--compact\s*{[^}]*flex-wrap: wrap;/s);
    expect(css).toContain('(pointer: coarse) and (max-width: 1100px)');
    expect(css).toMatch(
      /@media[^}]+\.machine-culture--compact\s*{[^}]*flex-direction: column;/s,
    );
  });
});
