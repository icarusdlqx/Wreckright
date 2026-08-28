import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Weapon } from '../../schema/weapon';
import { catalog } from '../../../tests/support';
import { FireModeComparison, fireModeComparisonRows } from './FireModeComparison';

function weapon(id: string): Weapon {
  const entry = catalog.weapons.get(id);
  if (entry === undefined) throw new Error(`missing weapon ${id}`);
  return entry;
}

describe('fire mode comparison', () => {
  it('resolves inherited stats in authored order and marks only the first mode as default', () => {
    const rows = fireModeComparisonRows(weapon('lbx_ac10'));
    expect(rows).toEqual([
      {
        modeId: 'cluster',
        name: 'Cluster',
        isDefault: true,
        damage: 1.2,
        projectiles: 10,
        volley: 12,
        perSecond: 4,
        accuracy: 1.1,
        heat: 2,
        cooldown: 3,
      },
      {
        modeId: 'slug',
        name: 'Slug',
        isDefault: false,
        damage: 13.2,
        projectiles: 1,
        volley: 13.2,
        perSecond: 13.2 / 3,
        accuracy: 1,
        heat: 2,
        cooldown: 3,
      },
    ]);
    expect(rows[1]?.perSecond).toBeCloseTo(4.4);
  });

  it('renders an accessible compact table with the authored labels and values', () => {
    const html = renderToStaticMarkup(
      createElement(FireModeComparison, { weapon: weapon('lbx_ac10') }),
    );

    expect(html).toContain('<h5 id="fire-modes-lbx_ac10">Fire modes</h5>');
    expect(html).toContain('<caption>Canister Cannon firing profiles</caption>');
    expect(html).toContain('<th scope="row"><span>Cluster</span><small>Default</small></th>');
    expect(html).toContain('12<small aria-label="10 projectiles at 1.2 damage each"> (10×1.2)</small>');
    expect(html).toContain('<td>4/s</td>');
    expect(html).toContain('<td>×1.1</td>');
    expect(html).toContain('<tr data-mode-id="slug">');
    expect(html).toContain('<td>13.2</td><td>4.4/s</td><td>×1</td><td>2</td><td>3s</td>');
    expect(html).not.toContain('Current');
  });

  it('renders nothing for a weapon without authored modes', () => {
    expect(
      renderToStaticMarkup(createElement(FireModeComparison, { weapon: weapon('medium_laser') })),
    ).toBe('');
  });
});
