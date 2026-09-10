import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalog } from '../../../tests/support';
import { startCampaign } from '../../campaign/campaign';
import { serialiseCampaign } from '../../campaign/save';
import { CampaignChooser } from './CampaignChooser';

describe('campaign chooser', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('allows an initial chooser to resume a same-faction parked company', () => {
    const state = startCampaign(catalog, 'border_dispute', 'parked-initial');
    vi.stubGlobal('localStorage', { getItem: () => serialiseCampaign(state) });
    const html = renderToStaticMarkup(createElement(CampaignChooser, {
      campaigns: [...catalog.campaigns.values()], currentId: state.campaignId, initial: true,
      onStart: vi.fn(), onClose: vi.fn(), onResume: vi.fn(),
    }));
    expect(html).toContain('data-testid="campaign-choice-resume"');
    expect(html).toContain('disabled="" data-testid="campaign-choice-start"');
    expect(html).not.toContain('data-testid="campaign-difficulty-picker"');
  });
  it('preserves an unreadable parked company and offers original-data export', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{bad-save' });
    const html = renderToStaticMarkup(createElement(CampaignChooser, {
      campaigns: [...catalog.campaigns.values()], currentId: 'border_dispute', initial: true,
      onStart: vi.fn(), onClose: vi.fn(),
    }));
    expect(html).toContain('data-testid="campaign-slot-recovery"');
    expect(html).toContain('disabled="" data-testid="campaign-choice-start"');
  });
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
    expect(html).toContain('Each faction has its own parked company slot');
    expect(html).toContain('disabled="" data-testid="campaign-choice-start"');
    expect(html).toContain('data-faction-logo="linewrought"');
    expect(html).toContain('data-faction-logo="aurelian"');
    expect(html).toContain('The Hands That Kept It');
    expect(html).toContain('A Clean Account');
  });

  it('an explicit New Campaign choice offers fresh difficulty even when a parked company exists', () => {
    const state = startCampaign(catalog, 'border_dispute', 'parked-new');
    vi.stubGlobal('localStorage', { getItem: () => serialiseCampaign(state) });
    const html = renderToStaticMarkup(createElement(CampaignChooser, {
      campaigns: [...catalog.campaigns.values()], currentId: state.campaignId, newRun: true,
      onStart: vi.fn(), onClose: vi.fn(), onResume: vi.fn(),
    }));
    expect(html).toContain('data-testid="campaign-difficulty-picker"');
    expect(html).not.toContain('disabled="" data-testid="campaign-choice-start"');
    expect(html).not.toContain('data-testid="campaign-choice-resume"');
    expect(html).toContain('Your current company is kept in Load Game before starting another.');
  });

  it('selects a real available faction if an old campaign identifier is no longer present', () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    const html = renderToStaticMarkup(createElement(CampaignChooser, {
      campaigns: [...catalog.campaigns.values()], currentId: 'missing_campaign', initial: true,
      onClose: vi.fn(), onStart: vi.fn(),
    }));
    expect(html).toMatch(/<option value="border_dispute"[^>]* selected=""/);
    expect(html).toContain('data-testid="campaign-difficulty-picker"');
    expect(html).not.toContain('Selected: missing_campaign');
  });
});
