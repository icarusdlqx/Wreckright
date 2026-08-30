import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { catalog } from '../../../tests/support';
import { CampaignChooser } from './CampaignChooser';

describe('campaign chooser', () => {
  it('offers both sides of the Recall and identifies the active save', () => {
    const html = renderToStaticMarkup(createElement(CampaignChooser, {
      campaigns: [...catalog.campaigns.values()],
      currentId: 'border_dispute',
      onClose: vi.fn(),
      onStart: vi.fn(),
    }));

    expect(html).toContain('data-testid="campaign-choice-border_dispute"');
    expect(html).toContain('data-testid="campaign-choice-aurelian_recall"');
    expect(html).toContain('The Great Recall');
    expect(html).toContain('The Great Recall: Custodians');
    expect(html).toContain('This is the campaign already in progress.');
    expect(html).toContain('Starting another campaign replaces that save slot');
    expect(html).toContain('disabled="" data-testid="campaign-choice-start"');
  });
});
