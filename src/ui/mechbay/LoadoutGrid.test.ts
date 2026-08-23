import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import type { MechLocation } from '../../schema/common';
import { computeLoadout } from '../../sim/loadout';
import { LoadoutGrid } from './LoadoutGrid';
import type { DropPayload } from './LocationCard';

function render(options: {
  armed?: DropPayload | null;
  selectedLocation?: MechLocation | null;
  compatibleLocations?: ReadonlySet<MechLocation>;
} = {}): string {
  const design = catalog.designs.get('sentinel_brawler');
  const chassis = catalog.chassis.get('sentinel_snl2');
  if (design === undefined || chassis === undefined) throw new Error('missing Sentinel fixture');
  return renderToStaticMarkup(createElement(LoadoutGrid, {
    catalog,
    chassis,
    design,
    loadout: computeLoadout(catalog, design),
    armed: options.armed ?? null,
    selectedLocation: options.selectedLocation ?? null,
    hoveredLocation: null,
    compatibleLocations: options.compatibleLocations ?? new Set<MechLocation>(),
    onCancelArmed: () => undefined,
    onDrop: () => undefined,
    onRemoveMount: () => undefined,
    onRemoveAmmo: () => undefined,
    onRemoveEquipment: () => undefined,
    onInspect: () => undefined,
    onSelectLocation: () => undefined,
    onHoverLocation: () => undefined,
  }));
}

describe('loadout fitting guide', () => {
  it('keeps the guide neutral until it can observe a held part', () => {
    const html = render();

    expect(html).toContain('Fit parts in three steps');
    expect(html).toContain('Ready to fit or review');
    expect(html).toContain('<span>1</span><strong>Pick</strong>');
    expect(html).toContain('<span>3</span><strong>Review</strong>');
    expect(html).not.toContain('aria-current="step"');
    expect(html.match(/data-testid="bay-location-/g)).toHaveLength(8);
  });

  it('makes placement and compatible locations explicit while a part is held', () => {
    const html = render({
      armed: { kind: 'weapon', id: 'medium_laser' },
      compatibleLocations: new Set<MechLocation>(['right_torso']),
    });

    expect(html).toContain('Step 2 of 3: holding Medium Laser');
    expect(html).toContain('aria-current="step"><span>2</span><strong>Place</strong>');
    expect(html).toContain('Fits held part');
    expect(html).toContain('Cannot fit held part');
    expect(html).toContain('aria-label="Cancel placement of Medium Laser"');
  });

  it('describes a selected location as a filter without claiming Review progress', () => {
    const html = render({ selectedLocation: 'left_arm' });

    expect(html).toContain('Left Arm is selected as a shelf filter');
    expect(html).toContain('inspect and remove fitted parts here');
    expect(html).not.toContain('Step 3 of 3');
    expect(html).not.toContain('aria-current="step"');
    expect(html).toContain('data-testid="bay-location-left_arm" data-selected="true"');
  });

  it('keeps two readable overview columns and 44px touch controls at phone size', () => {
    const css = readFileSync(new URL('./locationWorkbench.css', import.meta.url), 'utf8');

    expect(css).toMatch(/\.location-overview\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s);
    expect(css).toMatch(/@media \(max-width: 640px\), \(pointer: coarse\) and \(max-width: 1100px\)/);
    expect(css).toMatch(/\.location-overview \.slot-block,[\s\S]*?min-height: 44px;/);
    expect(css).toMatch(/\.location-overview \.slot-block__remove \{[\s\S]*?min-width: 58px;/);
  });
});
