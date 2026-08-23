import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { LinewroughtBuilder } from './LinewroughtBuilder';

function render(initialChassisId?: string): string {
  return renderToStaticMarkup(createElement(LinewroughtBuilder, {
    catalog,
    initialChassisId,
    onCancel: () => undefined,
    onCreate: () => undefined,
  }));
}

describe('Linewrought builder', () => {
  it('sets a clear, bounded construction promise in an accessible dialog', () => {
    const html = render();

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Start a shopbuilt mech');
    expect(html).toContain('frame, engine, hardpoint locations, and hardpoint sizes stay fixed');
    expect(html).toContain('weapons, ammunition, equipment, cooling, and armour');
    expect(html).toContain('does not create new chassis geometry');
    expect(html.toLowerCase()).not.toContain('fully custom chassis');
    expect(html).toContain('aria-label="Close Linewrought builder"');
  });

  it('shows only Linewrought mech cards with usable pros, cons, and fixed traits', () => {
    const html = render('cairn_crn3');

    expect(html.match(/data-testid="linewrought-frame-/g)).toHaveLength(5);
    expect(html).toContain('data-testid="linewrought-frame-hornet_hnt2"');
    expect(html).toContain('data-testid="linewrought-frame-cairn_crn3"');
    expect(html).not.toContain('data-testid="linewrought-frame-sentinel_snl2"');
    expect(html).not.toContain('data-testid="linewrought-frame-courser_crs1"');
    expect(html).not.toContain('data-testid="linewrought-frame-redoubt_rdt1"');
    expect(html).toContain('Strong suit');
    expect(html).toContain('Tradeoff');
    expect(html).toContain('Hardpoint capacity');
    expect(html).toContain('Long Stride');
    expect(html).toContain('Armour ceiling');
    expect(html).toMatch(/name="linewrought-frame"[^>]*checked=""[^>]*value="cairn_crn3"/);
  });

  it('offers the two honest starting modes and a named draft action', () => {
    const html = render('hornet_hnt2');

    expect(html).toContain('Bare gantry');
    expect(html).toContain('empty fittings');
    expect(html).toContain('Workshop recipe');
    expect(html).toContain('proven authored loadout');
    expect(html).toContain('data-testid="linewrought-name"');
    expect(html).toContain('Gadfly GAD-2 &#x27;Shopwork&#x27;');
    expect(html).toContain('data-testid="linewrought-create"');
    expect(html).toContain('Create shopbuilt draft');
  });

  it('uses single-column mobile cards and 44px touch targets', () => {
    const css = readFileSync(new URL('./linewroughtBuilder.css', import.meta.url), 'utf8');

    expect(css).toContain('(pointer: coarse) and (max-width: 1100px)');
    expect(css).toMatch(
      /\.linewrought-builder__frame-grid\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/s,
    );
    expect(css).toMatch(
      /\.linewrought-builder button,[\s\S]*?\.linewrought-frame\s*\{[^}]*min-height: 44px;/,
    );
  });
});
