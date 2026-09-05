import { useRef, useState } from 'react';
import type { CampaignPersistenceState } from '../../campaign/save';
import { CommandMark } from '../CommandMark';
import { usePlaytest } from '../playtest';
import { CampaignRecoveryNotice } from './CampaignRecoveryNotice';
import { CampaignRestartDialog } from './CampaignRestartDialog';
import './campaignHeader.css';

export interface CampaignHeaderProps {
  title: string;
  day: number;
  balance: string;
  seed: string;
  manualOpen: boolean;
  muted: boolean;
  persistence: CampaignPersistenceState;
  advanceDisabled: boolean;
  onAdvance: () => void;
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onExportRecovery: () => void;
  onImport: (text: string) => void;
  onChooseCampaign: () => void;
  onRestart: () => void;
  onToggleManual: () => void;
  onToggleMuted: () => void;
  onExit: () => void;
}

export function CampaignHeader({
  title,
  day,
  balance,
  seed,
  manualOpen,
  muted,
  persistence,
  advanceDisabled,
  onAdvance,
  onSave,
  onLoad,
  onExport,
  onExportRecovery,
  onImport,
  onChooseCampaign,
  onRestart,
  onToggleManual,
  onToggleMuted,
  onExit,
}: CampaignHeaderProps) {
  const { openFeedback } = usePlaytest();
  const filesRef = useRef<HTMLDetailsElement>(null);
  const filesToggleRef = useRef<HTMLElement>(null);
  const restartRef = useRef<HTMLButtonElement>(null);
  const [restartOpen, setRestartOpen] = useState(false);
  const closeFiles = (): void => {
    if (filesRef.current !== null) filesRef.current.open = false;
    filesToggleRef.current?.focus();
  };
  const fileAction = (action: () => void): void => {
    closeFiles();
    action();
  };

  return (
    <>
      <header className="camp-top camp-command-header">
        <div className="camp-command-main">
          <div className="camp-company-identity">
            <CommandMark size={40} />
            <div className="camp-title">
              <span className="camp-command-kicker">Company command</span>
              <h2>{title}</h2>
              <span className="camp-seed" data-testid="camp-seed"
                title="This code reproduces the campaign board and battles.">
                Run {seed}
              </span>
            </div>
          </div>
          <div className="camp-company-status" aria-label="Company status">
            <div>
              <span className="camp-stat-label">Local time</span>
              <strong data-testid="camp-day">Day {day}</strong>
            </div>
            <div>
              <span className="camp-stat-label">Treasury</span>
              <strong data-testid="camp-cbills">{balance}</strong>
            </div>
          </div>
          <button type="button" className="camp-advance-button" onClick={onAdvance}
            disabled={advanceDisabled} data-testid="camp-advance">
            Advance a day
          </button>
        </div>

        <div className="camp-command-tools">
          <details className="camp-company-files" ref={filesRef} data-testid="camp-files"
            onKeyDown={(event) => {
              if (event.key !== 'Escape' || restartOpen || filesRef.current?.open !== true) return;
              event.preventDefault();
              closeFiles();
            }}>
            <summary ref={filesToggleRef} data-testid="camp-files-toggle">Company files</summary>
            <div className="camp-files-panel">
              <p>Save or transfer your company.</p>
              <div className="camp-files-actions">
                <button type="button" onClick={() => fileAction(onSave)} data-testid="camp-save">
                  Save
                </button>
                <button type="button" onClick={() => fileAction(onLoad)} data-testid="camp-load">
                  Load
                </button>
                <button type="button" onClick={() => fileAction(onExport)} data-testid="camp-export">
                  Export
                </button>
                <label className="camp-import camp-file-import">
                  Import
                  <input type="file" accept="application/json" data-testid="camp-import"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file === undefined) return;
                      void file.text().then((text) => fileAction(() => onImport(text)));
                    }} />
                </label>
              </div>
              <div className="camp-files-actions camp-files-run">
                {/* Leave this disclosure open while a dialog owns focus. */}
                <button type="button" onClick={onChooseCampaign} data-testid="camp-campaigns">
                  Campaigns
                </button>
                <button type="button" ref={restartRef} className="camp-restart-link"
                  onClick={(event) => {
                    event.currentTarget.focus();
                    setRestartOpen(true);
                  }} data-testid="camp-restart">
                  Restart
                </button>
              </div>
            </div>
          </details>
          <nav className="camp-utility-actions" aria-label="Company help and settings">
            <button type="button" onClick={onToggleManual} data-testid="camp-manual-toggle"
              aria-expanded={manualOpen}>
              {manualOpen ? 'Close Manual' : 'Field Manual'}
            </button>
            <button type="button" onClick={onToggleMuted} aria-pressed={!muted}
              title={muted ? 'Sound is off' : 'Sound is on'} data-testid="campaign-mute-button">
              {muted ? 'Sound off' : 'Sound on'}
            </button>
            <button type="button" onClick={onExit} data-testid="camp-exit">Home</button>
            <button type="button" className="pause feedback-link" onClick={openFeedback}
              title="Something broken, unfair, or missing? Tell the builders."
              data-testid="feedback-link">
              Feedback
            </button>
          </nav>
        </div>
        <CampaignRecoveryNotice persistence={persistence} onExportOriginal={onExportRecovery} />
      </header>
      {restartOpen ? (
        <CampaignRestartDialog title={title} onCancel={() => setRestartOpen(false)}
          onConfirm={() => {
            setRestartOpen(false);
            onRestart();
          }} returnFocus={() => restartRef.current ?? filesToggleRef.current} />
      ) : null}
    </>
  );
}
