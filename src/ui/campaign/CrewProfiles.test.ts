import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { catalog } from '../../../tests/support';
import { startCampaign } from '../../campaign/campaign';
import { BarracksPanel } from './BarracksPanel';
import { CampaignChooser } from './CampaignChooser';
import { CampaignRestartDialog } from './CampaignRestartDialog';
import { PilotPortrait } from '../PilotPortrait';

describe('crew identity and campaign settings', () => {
  it('gives every named pilot a distinct authored portrait with an accessible label', () => {
    const identities = new Set<string>();
    for (const pilot of catalog.pilots.values()) {
      expect(pilot.portrait, pilot.id).toBeDefined();
      identities.add(JSON.stringify(pilot.portrait));
      const html = renderToStaticMarkup(createElement(PilotPortrait, { pilot }));
      expect(html).toContain(`aria-label="Portrait of ${pilot.name}"`);
      expect(html).not.toContain('<image');
    }
    expect(identities.size).toBe(catalog.pilots.size);
  });

  it('shows visible profiles and recovery, and removes KIA from active cards and assignments', () => {
    const state = startCampaign(catalog, 'border_dispute', 'crew-profiles');
    const wounded = state.pilots[0]!;
    wounded.recoveryMissions = 1;
    const killed = state.pilots[1]!;
    killed.dead = true;
    const html = renderToStaticMarkup(createElement(BarracksPanel, { state, mutate: vi.fn() }));
    expect(html).toContain('misses next mission');
    expect(html).toContain('class="pilot-bio"');
    expect(html).toContain('Strength:');
    expect(html).toContain('Watch:');
    expect(html).not.toContain(`data-testid="camp-pilot-${killed.id}"`);
    expect(html).not.toContain(`data-testid="camp-seat-${killed.id}"`);
    expect(html).toContain(`data-testid="memorial-${killed.id}"`);
    expect(html).toContain('campaign missions');
  });

  it('selects difficulty before a new campaign or restart, without a mission picker', () => {
    const initial = renderToStaticMarkup(createElement(CampaignChooser, {
      campaigns: [...catalog.campaigns.values()], currentId: 'border_dispute',
      initial: true, difficulty: 'veteran', onClose: vi.fn(), onStart: vi.fn(),
    }));
    expect(initial).toContain('data-testid="campaign-difficulty-picker"');
    expect(initial).toContain('value="veteran" selected=""');
    expect(initial).not.toContain('disabled="" data-testid="campaign-choice-start"');
    const restart = renderToStaticMarkup(createElement(CampaignRestartDialog, {
      title: 'The Great Recall', difficulty: 'elite', onCancel: vi.fn(), onConfirm: vi.fn(), returnFocus: () => null,
    }));
    expect(restart).toContain('value="elite" selected=""');
    expect(restart).toContain('Every contract uses this setting');
  });
});
