import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { AnatomyBackdrop } from './MechAnatomy';

describe('chassis-specific anatomy backdrop', () => {
  it('keeps the diagram decorative while identifying its real chassis', () => {
    const chassis = catalog.chassis.get('hornet_hnt2')!;
    const html = renderToStaticMarkup(createElement(AnatomyBackdrop, { chassis }));
    expect(html).toContain('data-chassis="hornet_hnt2"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-location="left_arm"');
    expect(html).not.toContain('tabindex');
    expect(html).not.toContain('canvas');
  });
});
