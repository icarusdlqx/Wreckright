import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import type { Design } from '../../schema/design';
import { BuildCompare } from './BuildCompare';

function stock(id: string): Design {
  const design = catalog.designs.get(id);
  if (design === undefined) throw new Error(`missing stock design ${id}`);
  return structuredClone(design);
}

function render(design: Design): string {
  return renderToStaticMarkup(createElement(BuildCompare, { catalog, design }));
}

describe('build comparison strip', () => {
  it('renders seven semantic, neutral stock metrics without live-region chatter', () => {
    const html = render(stock('colossus_siege'));

    expect(html).toContain('aria-labelledby="build-compare-title"');
    expect(html).toContain('Compared with stock');
    expect(html).toContain('Colossus');
    expect(html).toContain('<dl class="build-compare__metrics"');
    expect(html.match(/data-direction="neutral"/g)).toHaveLength(7);
    expect(html).toContain('<dt>Heat margin</dt>');
    expect(html).toContain('<dt>Long-band DPS</dt>');
    expect(html).toContain('Speed unchanged');
    expect(html).not.toContain('aria-live');
    expect(html).not.toContain('role="status"');
  });

  it('makes the Gauss-to-two-Longshots trade readable without relying on colour', () => {
    const design = stock('colossus_siege');
    design.id = 'colossus_longshot_trade';
    const gauss = design.mounts.findIndex(
      (mount) => mount.weaponId === 'gauss_rifle' && mount.location === 'right_torso',
    );
    design.mounts.splice(
      gauss,
      1,
      { weaponId: 'lrm10', location: 'right_torso' },
      { weaponId: 'lrm10', location: 'left_torso' },
    );
    const html = render(design);

    expect(html).toContain('data-testid="build-compare-heat_margin" data-direction="bad"');
    expect(html).toContain('Heat margin decreased by 1.8 heat/s');
    expect(html).toContain('data-testid="build-compare-alpha_damage" data-direction="good"');
    expect(html).toContain('Alpha increased by 24.0 damage');
    expect(html.match(/data-direction="good"/g)).toHaveLength(4);
    expect(html.match(/data-direction="neutral"/g)).toHaveLength(2);
    expect(html).toContain('20.1');
    expect(html).toContain('26.1');
    expect(html).toContain('11.7');
    expect(html).toContain('15.2');
  });
});
