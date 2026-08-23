import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import type { MechLocation } from '../../schema/common';
import { evaluateDrop } from './mechbayEdits';
import { StoreShelf } from './StoreShelf';

function requireDesign() {
  const found = catalog.designs.get('sentinel_brawler');
  if (found === undefined) throw new Error('missing Sentinel design');
  return found;
}

function requireChassis() {
  const found = catalog.chassis.get('sentinel_snl2');
  if (found === undefined) throw new Error('missing Sentinel chassis');
  return found;
}

const design = requireDesign();
const chassis = requireChassis();

function render(
  extra: Partial<Parameters<typeof StoreShelf>[0]> = {},
): string {
  return renderToStaticMarkup(
    createElement(StoreShelf, {
      catalog,
      chassis,
      design,
      inventory: undefined,
      shelf: 'weapons',
      showAll: false,
      selectedLocation: null,
      armed: null,
      inspected: null,
      onShelfChange: () => undefined,
      onShowAllChange: () => undefined,
      onClearLocation: () => undefined,
      onInspect: () => undefined,
      onArm: () => undefined,
      onHoverWeapon: () => undefined,
      ...extra,
    }),
  );
}

function cardMarkup(html: string, weaponId: string): string {
  const start = html.indexOf(`data-testid="weapon-card-${weaponId}"`);
  if (start < 0) throw new Error(`missing rendered card ${weaponId}`);
  const end = html.indexOf('</article>', start);
  return html.slice(start, end);
}

describe('compact mechbay catalog', () => {
  it('renders searchable Weapons, Ammo, and Gear tabs with one inspector', () => {
    const html = render();
    expect(html).toContain('data-testid="shelf-weapons"');
    expect(html).toContain('data-testid="shelf-ammo"');
    expect(html).toContain('data-testid="shelf-equipment"');
    expect(html).toContain('>Gear</button>');
    expect(html).toContain('type="search"');
    expect(html).toContain('data-testid="shelf-search"');
    expect(html).toContain('data-testid="shelf-family"');
    expect(html).toContain('data-testid="shelf-show-all"');
    expect(html.match(/id="bay-shelf-inspector"/g)).toHaveLength(1);
    expect(html.match(/role="meter"/g)).toHaveLength(3);
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-controls="bay-shelf-results"');
  });

  it('keeps an incompatible row readable and inspectable with its first exact reason', () => {
    const location: MechLocation = 'right_torso';
    const fit = evaluateDrop(
      catalog,
      design,
      { kind: 'weapon', id: 'gauss_rifle' },
      location,
    );
    const reason = fit.reasons[0]?.message;
    if (reason === undefined) throw new Error('Gauss fixture unexpectedly fits');
    const html = render({
      showAll: true,
      selectedLocation: location,
      inspected: { kind: 'weapon', id: 'gauss_rifle' },
    });
    const row = cardMarkup(html, 'gauss_rifle');

    expect(row).toContain('data-testid="stock-weapon-gauss_rifle"');
    expect(row).toContain('aria-disabled="true"');
    expect(row).toContain('draggable="false"');
    expect(row).toContain('aria-current="true"');
    expect(row).toContain('aria-controls="bay-shelf-inspector"');
    expect(row).toContain("Doesn&#x27;t fit");
    expect(row).toContain(reason);
    expect(row).not.toContain('role="meter"');
    expect(row).not.toContain('weapon-range-strip');
    expect(html).toContain(`title="${reason}"`);
    expect(html).toContain('data-testid="dossier-fit"');
  });

  it('retains the fits-only discovery path and truthful ammo and gear inspectors', () => {
    const fitOnly = render({ selectedLocation: 'right_torso' });
    expect(fitOnly).not.toContain('data-testid="stock-weapon-gauss_rifle"');
    expect(fitOnly).toContain("Include Doesn&#x27;t fit");

    const ammo = render({ shelf: 'ammo' });
    expect(ammo).toContain('data-inspected-kind="ammo"');
    expect(ammo).toContain('1 ton');

    const gear = render({ shelf: 'equipment' });
    expect(gear).toContain('data-inspected-kind="equipment"');
    expect(gear).toContain('data-testid="shelf-show-all"');
    expect(gear).toContain("Include Doesn&#x27;t fit");
    expect(gear).not.toMatch(/sensor range factor|incoming accuracy factor|ammo blast containment/);
  });

  it('uses master-detail desktop grammar and one-column controls at 390px', () => {
    const css = readFileSync(new URL('./storeShelf.css', import.meta.url), 'utf8');
    expect(css).toMatch(
      /\.bay-side\.bay-catalog\s*{[^}]*grid-template-areas:[^}]*catalog-results[^}]*catalog-inspector/s,
    );
    expect(css).toMatch(
      /\.weapon-card--compact \.weapon-card__pick\s*{[^}]*grid-template-columns: minmax\(0, 1fr\) 108px;/s,
    );
    expect(css).toContain('@media (max-width: 420px)');
    expect(css).toMatch(/@media \(max-width: 420px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(css).toContain('min-height: 44px;');
    expect(css).toMatch(/\.bay-catalog > \.bay-catalog-inspector\s*{[^}]*order: 2;/s);
    expect(css).toContain('max-height: min(42dvh, 300px);');
    expect(css).toContain('overflow-wrap: anywhere;');
  });
});
