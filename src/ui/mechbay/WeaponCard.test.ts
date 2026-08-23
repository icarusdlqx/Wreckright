import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import type { Weapon } from '../../schema/weapon';
import { WeaponCard } from './WeaponCard';

function weapon(id: string): Weapon {
  const entry = catalog.weapons.get(id);
  if (entry === undefined) throw new Error(`missing weapon ${id}`);
  return entry;
}

function render(id: string, extra: Partial<Parameters<typeof WeaponCard>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(WeaponCard, {
      catalog,
      weapon: weapon(id),
      ...extra,
    }),
  );
}

describe('weapon card', () => {
  it('is a native keyboard-operable button with drag payload support', () => {
    const html = render('ac5', { selected: true });
    expect(html).toContain('<button type="button" class="weapon-card__pick"');
    expect(html).toContain('type="button"');
    expect(html).toContain('draggable="true"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-controls="bay-shelf-inspector"');
    expect(html).toContain('data-testid="weapon-card-ac5"');
  });

  it('keeps only the three quick comparison numbers in the repeated row', () => {
    const html = render('lrm20');
    expect(html).toContain('aria-label="Weapon summary"');
    expect(html).toContain('10.25/s damage');
    expect(html).toContain('540m reach');
    expect(html).toContain('1.5/s heat');
    expect(html).not.toContain('role="meter"');
    expect(html).not.toContain('weapon-range-strip');
  });

  it('uses faction text as well as tint and marks foreign-pattern equipment', () => {
    const foreign = render('large_laser', { chassisFaction: 'linewrought' });
    expect(foreign).toContain('data-faction="aurelian"');
    expect(foreign).toContain('faction-aurelian');
    expect(foreign).toContain('Aurelian Stock');
    expect(foreign).toContain('Foreign pattern — origin only');
    expect(foreign).toContain('Culture is informational; mount, slots, tonnage, and stock decide fit.');

    const domestic = render('large_laser', { chassisFaction: 'aurelian' });
    expect(domestic).not.toContain('Foreign pattern');
  });

  it('shows fit state and keeps expanded operating prose out of every row', () => {
    const html = render('lrm10');
    expect(html).toContain('data-fit="true"');
    expect(html).toContain('>Fit<');
    expect(html).toContain('Ready to place.');
    expect(html).not.toContain('1 ton of ammo lasts');
    expect(html).not.toContain('line of sight is still required');
  });

  it('keeps unavailable cards inspectable but prevents activation and dragging', () => {
    const html = render('gauss_rifle', {
      unavailableReason: 'Needs a heavy ballistic mount.',
      stock: 2,
    });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('draggable="false"');
    expect(html).toContain('data-fit="false"');
    expect(html).toContain("Doesn&#x27;t fit");
    expect(html).toContain('Needs a heavy ballistic mount.');
    expect(html).toContain('×2');
  });
});
