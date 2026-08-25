import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { catalog } from '../../../tests/support';
import type { Design } from '../../schema/design';
import { computeHeatProfile, computeLoadout } from '../../sim/loadout';
import { BuildReview, navigateAndFocusWorkspace } from './BuildReview';

function stock(): Design {
  const design = catalog.designs.get('sentinel_brawler');
  if (design === undefined) throw new Error('missing Sentinel design');
  return structuredClone(design);
}

function render(design: Design, withNavigation = false): string {
  return renderToStaticMarkup(createElement(BuildReview, {
    catalog,
    design,
    loadout: computeLoadout(catalog, design),
    heat: computeHeatProfile(catalog, design),
    ...(withNavigation ? { onNavigate: () => undefined } : {}),
  }));
}

describe('build review presentation', () => {
  it('shows one concise legal verdict and all requested build summaries', () => {
    const html = render(stock());

    expect(html).toContain('aria-labelledby="build-review-title"');
    expect(html).toContain('Final inspection');
    expect(html).toContain('Legal loadout');
    expect(html).toContain('Every fitting check passed.');
    expect(html).toContain('aria-label="Loadout totals"');
    expect(html).toContain('<dt>Tonnage</dt>');
    expect(html).toContain('<dt>Slots</dt>');
    expect(html).toContain('<dt>Armour</dt>');
    expect(html).toContain('<dt>Cooling</dt>');
    expect(html).toContain('Weapons');
    expect(html).toContain('Medium Laser ×3');
    expect(html).toContain('Ammunition');
    expect(html).toContain('rounds');
    expect(html).toContain('Fitting checks clear');
    expect(html).toContain('Ready to commit');
    expect(html).not.toContain('Fix before commit');
  });

  it('renders structured issues by component with exact locations and actions', () => {
    const design = stock();
    design.ammo = [{ weaponId: 'medium_laser', location: 'head', tons: 1 }];
    const html = render(design, true);

    expect(html).toContain('Loadout not legal');
    expect(html).toContain('Fix before commit');
    expect(html).toContain('data-issue-component="weapon"');
    expect(html).toContain('data-issue-component="ammo"');
    expect(html).toContain('data-issue-code="energy_ammo"');
    expect(html).toContain('data-issue-source="loadout"');
    expect(html).toContain('Head');
    expect(html).toContain('Remove this bin; the matching weapon does not consume ammunition.');
    expect(html).toContain('Open Loadout');
    expect(html).toContain('data-testid="build-review-fix"');
    expect(html).toContain('Go to Loadout');
    expect(html).toContain('aria-controls="bay-workspace-panel-loadout"');
    expect(html).toContain('data-focus-target="bay-workspace-tab-loadout"');
  });

  it('offers an armour correction in the systems workspace', () => {
    const design = stock();
    const chassis = catalog.chassis.get(design.chassisId);
    if (chassis === undefined) throw new Error('missing Sentinel chassis');
    design.armour.head = chassis.armourMax.head + 1;
    const html = render(design, true);

    expect(html).toContain('data-issue-component="armour"');
    expect(html).toContain('Open Armour &amp; Cooling');
    expect(html).toContain('Go to Armour &amp; Cooling');
    expect(html).toContain('aria-controls="bay-workspace-panel-armour"');
    expect(html).toContain('data-focus-target="bay-workspace-tab-armour"');
  });

  it('activates the correction workspace before focusing its tab on the next frame', () => {
    const order: string[] = [];
    const focus = vi.fn(() => { order.push('focus'); });
    let scheduled: FrameRequestCallback | null = null;
    const getElementById = vi.fn((id: string) => (
      id === 'bay-workspace-tab-armour' ? { focus } : null
    ));
    const ownerDocument = {
      getElementById,
      defaultView: {
        requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
          order.push('scheduled');
          scheduled = callback;
          return 1;
        }),
      },
    } as unknown as Document;

    navigateAndFocusWorkspace(
      { ownerDocument } as HTMLElement,
      'armour',
      () => { order.push('navigate'); },
    );

    expect(order).toEqual(['navigate', 'scheduled']);
    expect(focus).not.toHaveBeenCalled();
    expect(scheduled).not.toBeNull();
    (scheduled as unknown as FrameRequestCallback)(0);
    expect(getElementById).toHaveBeenCalledWith('bay-workspace-tab-armour');
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(order).toEqual(['navigate', 'scheduled', 'focus']);
  });

  it('falls back to the labelled panel through the source document', () => {
    const focus = vi.fn();
    const getElementById = vi.fn((id: string) => (
      id === 'bay-workspace-panel-loadout' ? { focus } : null
    ));
    const ownerDocument = {
      getElementById,
      defaultView: null,
    } as unknown as Document;
    const navigate = vi.fn();

    navigateAndFocusWorkspace(
      { ownerDocument } as HTMLElement,
      'loadout',
      navigate,
    );

    expect(navigate).toHaveBeenCalledWith('loadout');
    expect(getElementById).toHaveBeenNthCalledWith(1, 'bay-workspace-tab-loadout');
    expect(getElementById).toHaveBeenNthCalledWith(2, 'bay-workspace-panel-loadout');
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('shows non-blocking equipment advice without contradicting the legal verdict', () => {
    const design = stock();
    const containment = design.equipment.find((fit) => fit.equipmentId === 'case');
    if (containment === undefined) throw new Error('missing containment fixture');
    containment.location = 'head';
    const html = render(design, true);

    expect(html).toContain('Legal loadout');
    expect(html).toContain('1 advisory note; this loadout can still be saved.');
    expect(html).toContain('Advisory notes');
    expect(html).toContain('data-issue-severity="warning"');
    expect(html).not.toContain('Fix before commit');
  });

  it('keeps controls touch-sized and reflows at narrow and short-landscape breakpoints', () => {
    const css = readFileSync(new URL('./mechbayWorkspace.css', import.meta.url), 'utf8');
    expect(css).toContain('min-height: 44px;');
    expect(css).toContain('@media (max-width: 420px)');
    expect(css).toContain('@media (max-height: 600px) and (orientation: landscape)');
    expect(css).toMatch(
      /@media \(max-width: 420px\)[\s\S]*\.build-review__metrics\s*{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/,
    );
  });
});
