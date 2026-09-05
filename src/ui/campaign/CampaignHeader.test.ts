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
    manualOpen: false, muted: true, advanceDisabled: false,
    persistence: { mode: 'persistent', issue: null, detail: null, recoveryRaw: null },
    onAdvance: noAction, onSave: noAction, onLoad: noAction, onExport: noAction,
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
  it('keeps file controls in one closed native disclosure and help controls outside it', () => {
    const markup = header();
    const files = markup.slice(markup.indexOf('<details'), markup.indexOf('</details>'));
    expect(files).toContain('data-testid="camp-files"');
    expect(files).toContain('<summary');
    expect(files).toContain('data-testid="camp-files-toggle"');
    expect(files).not.toMatch(/<details[^>]*\sopen(?:\s|=|>)/);
    for (const action of ['save', 'load', 'export', 'import', 'campaigns', 'restart']) {
      expect(files).toContain(`data-testid="camp-${action}"`);
    }
    for (const id of ['camp-manual-toggle', 'campaign-mute-button', 'camp-exit', 'feedback-link']) {
      expect(markup).toContain(`data-testid="${id}"`);
      expect(files).not.toContain(`data-testid="${id}"`);
    }
    expect(markup).toContain('Run field-code');
    expect(markup).toContain('data-testid="camp-day">Day 3');
    expect(markup).toContain('data-testid="camp-cbills">240,000 C-bills');
    expect(files).not.toContain('camp-advance');
    expect(markup).not.toContain('data-testid="camp-restart-dialog"');
  });

  it('keeps recovery actions reachable outside the closed file controls', () => {
    const markup = header({
      persistence: { mode: 'memory-only', issue: 'invalid-save', detail: null, recoveryRaw: '{bad' },
    });
    expect(markup.indexOf('data-testid="camp-recovery"')).toBeGreaterThan(markup.indexOf('</details>'));
    expect(markup).toContain('data-testid="camp-recovery-export"');
  });

  it('labels restart as a replacement and presents keeping the run before confirming', () => {
    const markup = renderToStaticMarkup(createElement(CampaignRestartDialog, {
      title: 'The Border Dispute', onCancel: () => undefined, onConfirm: () => undefined,
      returnFocus: () => null,
    }));
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-labelledby="camp-restart-title"');
    expect(markup).toContain('aria-describedby="camp-restart-detail"');
    expect(markup).toContain('This replaces your current company');
    expect(markup.indexOf('data-testid="camp-restart-cancel"'))
      .toBeLessThan(markup.indexOf('data-testid="camp-restart-confirm"'));
  });
});
