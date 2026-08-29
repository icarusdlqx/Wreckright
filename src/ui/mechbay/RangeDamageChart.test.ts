import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import type { Weapon } from '../../schema/weapon';
import { RangeDamageChart } from './RangeDamageChart';
import { mountedWeaponProfiles } from './rangeDamageChartModel';

function weapon(id: string): Weapon {
  const entry = catalog.weapons.get(id);
  if (entry === undefined) throw new Error(`missing weapon ${id}`);
  return entry;
}

describe('range damage chart', () => {
  it('renders distinct accessible inspected and stacked loadout charts', () => {
    const cairn = catalog.designs.get('cairn_battery');
    if (cairn === undefined) throw new Error('missing Cairn battery');
    const html = renderToStaticMarkup(createElement(RangeDamageChart, {
      catalog,
      weapon: weapon('lrm10'),
      mountedWeapons: mountedWeaponProfiles(catalog, cairn.mounts),
    }));

    expect(html).toContain('data-testid="range-damage-chart"');
    expect(html).toContain('data-range-maximum="600"');
    expect(html.match(/role="img"/g)).toHaveLength(2);
    expect(html.match(/focusable="false"/g)).toHaveLength(2);
    expect(html).toContain('Longshot 10 expected damage by range, 0 to 600 metres');
    expect(html).toContain('Current loadout expected damage by range, 0 to 600 metres');
    expect(html).toContain('falls to 2.81 expected DPS inside 60 metres');
    expect(html).toContain('data-range-breakpoint="minimum"');
    expect(html).toContain('data-distance="60"');
    expect(html).toContain('data-chart-series="inspected"');
    expect(html.match(/data-chart-series="loadout"/g)).toHaveLength(3);
    expect(html).toContain('data-weapon-id="streak_srm6"');
    expect(html).toContain('data-mount-count="2"');
    expect(html).toContain('Expected output continues across the full 0 to 600 metre chart.');
  });

  it('keeps an unmounted shelf candidate out of the current loadout stack', () => {
    const mounted = [{ weapon: weapon('medium_laser'), modeId: null }];
    const html = renderToStaticMarkup(createElement(RangeDamageChart, {
      catalog,
      weapon: weapon('lrm10'),
      mountedWeapons: mounted,
    }));
    const loadout = html.slice(html.indexOf('data-chart="loadout"'));
    expect(loadout).toContain('data-weapon-id="medium_laser"');
    expect(loadout).not.toContain('data-weapon-id="lrm10"');
    expect(loadout).toContain('No expected output from 225 to 600 metres.');
  });
});
