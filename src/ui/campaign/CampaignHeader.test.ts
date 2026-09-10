import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlaytestProvider } from '../playtest';
import { CampaignHeader, type CampaignHeaderProps } from './CampaignHeader';
import { CampaignRestartDialog } from './CampaignRestartDialog';

function header(overrides: Partial<CampaignHeaderProps> = {}): string {
  const noAction = (): void => undefined;
  const props: CampaignHeaderProps = {
    title: 'The Border Dispute', day: 3, balance: '240,000 C-bills', seed: 'field-code',
    manualOpen: false, muted: true, nextDisabled: false, nextLabel: 'Next mission',
    persistence: { mode: 'persistent', issue: null, detail: null, recoveryRaw: null },
    onNext: noAction, onSave: noAction, onLoad: noAction, onExport: noAction,
    onExportRecovery: noAction, onImport: noAction, onChooseCampaign: noAction,
    onRestart: noAction, onToggleManual: noAction, onToggleMuted: noAction, onExit: noAction,
    ...overrides,
  };
  return renderToStaticMarkup(createElement(PlaytestProvider, {
    initialConsentPrompt: false,
    children: createElement(CampaignHeader, props),
  }));
}

describe('campaign command header', () => {
  it('exposes Save Game and Load Game beside a closed disclosure for transfer and company controls', () => {
    const markup = header();
    const files = markup.slice(markup.indexOf('<details'), markup.indexOf('</details>'));
    expect(files).toContain('data-testid="camp-files"');
    expect(files).toContain('<summary');
    expect(files).toContain('data-testid="camp-files-toggle"');
    expect(files).not.toMatch(/<details[^>]*\sopen(?:\s|=|>)/);
    for (const action of ['export', 'import', 'campaigns', 'restart']) {
      expect(files).toContain(`data-testid="camp-${action}"`);
    }
    for (const id of ['camp-save', 'camp-load', 'camp-manual-toggle', 'campaign-mute-button', 'audio-settings', 'camp-exit', 'feedback-link']) {
      expect(markup).toContain(`data-testid="${id}"`);
      expect(files).not.toContain(`data-testid="${id}"`);
    }
    expect(markup).toContain('Run field-code');
    expect(markup).toContain('data-testid="camp-day">Day 3');
    expect(markup).toContain('data-testid="camp-cbills">240,000 C-bills');
    expect(files).not.toContain('camp-advance');
    expect(markup).toContain('data-testid="camp-next-mission"');
    expect(markup).not.toContain('Advance a day');
    expect(markup).not.toContain('data-testid="camp-restart-dialog"');
  });

  it('keeps recovery actions reachable outside the closed file controls', () => {
    const markup = header({
      persistence: { mode: 'memory-only', issue: 'invalid-save', detail: null, recoveryRaw: '{bad' },
    });
    expect(markup.indexOf('data-testid="camp-recovery"')).toBeGreaterThan(markup.indexOf('</details>'));
    expect(markup).toContain('data-testid="camp-recovery-export"');
  });

  it('explains that restarting keeps the current company and offers cancellation first', () => {
    const markup = renderToStaticMarkup(createElement(CampaignRestartDialog, {
      title: 'The Border Dispute', onCancel: () => undefined, onConfirm: () => undefined,
      returnFocus: () => null,
    }));
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-labelledby="camp-restart-title"');
    expect(markup).toContain('aria-describedby="camp-restart-detail"');
    expect(markup).toContain('kept in Load Game before the new run begins.');
    expect(markup.indexOf('data-testid="camp-restart-cancel"'))
      .toBeLessThan(markup.indexOf('data-testid="camp-restart-confirm"'));
  });
});
