import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { Dossier } from './Dossier';

function render(
  inspected: Parameters<typeof Dossier>[0]['inspected'],
  extra: Partial<Parameters<typeof Dossier>[0]> = {},
): string {
  return renderToStaticMarkup(
    createElement(Dossier, {
      catalog,
      inspected,
      heatSinkId: 'heat_sink',
      ...extra,
    }),
  );
}

describe('mechbay catalog inspector', () => {
  it('uses a neutral empty instruction for all three catalog tabs', () => {
    const html = render(null);
    expect(html).toContain('Select a weapon, ammo bin, or equipment item.');
    expect(html).toContain('id="bay-shelf-inspector"');
    expect(html).toContain('aria-label="Selected item details"');
  });

  it('holds the expanded weapon comparison in one accessible inspector', () => {
    const mounted = catalog.weapons.get('srm6');
    if (mounted === undefined) throw new Error('missing SRM 6');
    const html = render(
      { kind: 'weapon', id: 'lrm10' },
      {
        mountedWeapons: [mounted],
        chassisFaction: 'aurelian',
        fit: { ok: false, reason: 'Right Torso has no free missile hardpoint.' },
      },
    );

    expect(html.match(/role="meter"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Damage"');
    expect(html).toContain('aria-valuetext="5.63 damage per second"');
    expect(html).toContain('weapon-range-strip');
    expect(html).toContain('Foreign pattern — origin only');
    expect(html).toContain('Right Torso has no free missile hardpoint.');
    expect(html).toContain('1 ton of ammo lasts 48s at full cycle.');
    expect(html).toContain('line of sight is still required');
  });

  it('describes the selected ammunition bin rather than the weapon chassis cost', () => {
    const html = render({ kind: 'ammo', id: 'lrm10' });
    expect(html).toContain('Longshot 10 ammunition');
    expect(html).toContain('1 ton · 12 rounds · 1 slot');
    expect(html).toContain('one ton lasts about 48s at full cycle');
    expect(html).not.toContain('5 tons');
    expect(html).not.toContain('role="meter"');
  });
});
