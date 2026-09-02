import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import type { MechLocation } from '../../schema/common';
import { ChassisSilhouette } from './ChassisSilhouette';
import { partPaint } from './silhouetteGeometry';

function sentinel() {
  const design = catalog.designs.get('sentinel_brawler');
  const chassis = catalog.chassis.get('sentinel_snl2');
  if (design === undefined || chassis === undefined) throw new Error('missing Sentinel fixture');
  return { chassis, design };
}

describe('chassis silhouette armour state', () => {
  it('leaves default consumers and their presentational mount badges unchanged', () => {
    const fixture = sentinel();
    const plain = renderToStaticMarkup(createElement(ChassisSilhouette, fixture));
    const empty = renderToStaticMarkup(createElement(ChassisSilhouette, {
      ...fixture,
      underArmoured: new Set<MechLocation>(),
    }));

    expect(empty).toBe(plain);
    expect(plain).toContain('role="img"');
    expect(plain).toContain('aria-label="Sentinel outline"');
    expect(plain.match(/class="sil-mount"/g)).toHaveLength(4);
    expect(plain).not.toContain('data-armour-state');
    expect(plain).not.toMatch(/tabindex|<button/);
  });

  it('washes every piece at an under-armoured location in red', () => {
    const html = renderToStaticMarkup(createElement(ChassisSilhouette, {
      ...sentinel(),
      underArmoured: new Set<MechLocation>(['left_torso']),
    }));

    expect(html).toContain('data-armour-state="under-armoured"');
    expect(html.match(/data-armour-state="under-armoured"/g)?.length).toBeGreaterThan(0);
    expect(partPaint('plate', false, false, true)('front')).not.toBe(
      partPaint('plate', false, false)('front'),
    );
  });

  it('keeps the selected yellow state ahead of the armour warning', () => {
    const fixture = sentinel();
    const selected = renderToStaticMarkup(createElement(ChassisSilhouette, {
      ...fixture,
      active: 'left_torso',
      underArmoured: new Set<MechLocation>(['left_torso']),
    }));
    const ordinarySelection = renderToStaticMarkup(createElement(ChassisSilhouette, {
      ...fixture,
      active: 'left_torso',
    }));

    expect(selected).toContain('data-armour-state="selected"');
    expect(selected).not.toContain('data-armour-state="under-armoured"');
    expect(selected).toBe(ordinarySelection);
    expect(partPaint('plate', true, false, true)('front')).toBe(
      partPaint('plate', true, false)('front'),
    );
  });
});
