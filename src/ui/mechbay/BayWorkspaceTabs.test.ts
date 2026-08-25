import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  BayWorkspacePanel,
  BayWorkspaceTabs,
  bayWorkspacePanelId,
  bayWorkspaceTabId,
  nextBayWorkspaceTab,
} from './BayWorkspaceTabs';

describe('mechbay workspace tabs', () => {
  it('links all three tabs to their panels and includes the review issue count', () => {
    const html = renderToStaticMarkup(createElement(BayWorkspaceTabs, {
      active: 'armour',
      issueCount: 3,
      onSelect: () => undefined,
    }));

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Mechbay workspace"');
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html).toContain('Loadout');
    expect(html).toContain('Armour &amp; Cooling');
    expect(html).toContain('Review');
    expect(html).toContain('aria-label="3 loadout issues"');
    expect(html).toContain('data-workspace-tab="armour"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain(`aria-controls="${bayWorkspacePanelId('review')}"`);
  });

  it('supports the standard horizontal tab keyboard order with wrapping', () => {
    expect(nextBayWorkspaceTab('loadout', 'ArrowRight')).toBe('armour');
    expect(nextBayWorkspaceTab('armour', 'ArrowRight')).toBe('review');
    expect(nextBayWorkspaceTab('review', 'ArrowRight')).toBe('loadout');
    expect(nextBayWorkspaceTab('loadout', 'ArrowLeft')).toBe('review');
    expect(nextBayWorkspaceTab('review', 'Home')).toBe('loadout');
    expect(nextBayWorkspaceTab('loadout', 'End')).toBe('review');
    expect(nextBayWorkspaceTab('loadout', 'Enter')).toBeNull();
  });

  it('provides labelled, focusable panels and hides inactive workspaces', () => {
    const active = renderToStaticMarkup(createElement(BayWorkspacePanel, {
      tab: 'loadout',
      active: true,
      children: 'Loadout content',
    }));
    const inactive = renderToStaticMarkup(createElement(BayWorkspacePanel, {
      tab: 'review',
      active: false,
      children: 'Review content',
    }));

    expect(active).toContain(`id="${bayWorkspacePanelId('loadout')}"`);
    expect(active).toContain(`aria-labelledby="${bayWorkspaceTabId('loadout')}"`);
    expect(active).toContain('role="tabpanel"');
    expect(active).toContain('tabindex="0"');
    expect(active).not.toContain('hidden=""');
    expect(inactive).toContain('hidden=""');
  });
});
