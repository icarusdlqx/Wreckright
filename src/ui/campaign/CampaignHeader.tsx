import { useRef, useState, type ReactNode } from 'react';
import type { CampaignPersistenceState } from '../../campaign/save';
import { CommandMark } from '../CommandMark';
import { AudioSettings } from '../AudioSettings';
import { usePlaytest } from '../playtest';
import { CampaignRecoveryNotice } from './CampaignRecoveryNotice';
import { CampaignRestartDialog } from './CampaignRestartDialog';
import './campaignHeader.css';
import { WikiLink } from '../wiki/WikiLink';

export interface CampaignHeaderProps {
  title: string;
  day: number;
  balance: string;
  seed: string;
  difficulty?: string;
  manualOpen: boolean;
  muted: boolean;
  persistence: CampaignPersistenceState;
  nextDisabled: boolean;
  nextLabel: string;
  onNext: () => void;
  waiting?: ReactNode;
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onExportRecovery: () => void;
  onImport: (text: string) => void;
  onChooseCampaign: () => void;
  onRestart: (difficulty: string) => void;
  onToggleManual: () => void;
  onToggleMuted: () => void;
  onExit: () => void;
}

export function CampaignHeader({
  title,
  balance,
  seed,
  difficulty = 'regular',
  manualOpen,
  muted,
  persistence,
  nextDisabled,
  nextLabel,
  onNext,
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
  const dialogAction = (action: () => void, launcher: HTMLButtonElement): void => {
    if (filesRef.current !== null) filesRef.current.open = false;
    launcher.focus();
    action();
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
                Run {seed} · {difficulty} difficulty
              </span>
            </div>
          </div>
          <div className="camp-company-status" aria-label="Company status">
            <div>
              <span className="camp-stat-label">Treasury</span>
              <strong data-testid="camp-cbills">{balance}</strong>
            </div>
            <div className={`camp-save-state ${persistence.mode === 'persistent' ? 'is-saved' : 'is-session'}`}
              role="status" aria-live="polite" data-testid="camp-save-state"
              title={persistence.mode === 'persistent'
                ? 'Company changes autosave in this browser.'
                : 'Recent changes exist only in this tab. Use the recovery instructions below before closing it.'}>
              <span className="camp-save-glyph" aria-hidden="true">{persistence.mode === 'persistent' ? '✓' : '!'}</span>
              <span>
                <span className="camp-stat-label">Campaign save</span>
                <strong>{persistence.mode === 'persistent' ? 'Saved locally' : 'Session only'}</strong>
              </span>
            </div>
          </div>
          <button type="button" className="camp-next-button" onClick={onNext}
            disabled={nextDisabled} data-testid="camp-next-mission"
            title={nextDisabled ? 'This campaign has ended. Review the Journal or start another campaign.' : nextLabel}>
            {nextLabel} →
          </button>
        </div>

        <div className="camp-command-tools">
          <div className="camp-save-actions" aria-label="Campaign saves">
            <button type="button" onClick={(event) => dialogAction(onSave, event.currentTarget)} data-testid="camp-save">Save Game</button>
            <button type="button" onClick={(event) => dialogAction(onLoad, event.currentTarget)} data-testid="camp-load">Load Game</button>
          </div>
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
            <WikiLink className="camp-wiki-link" data-testid="camp-wiki">Story & machines</WikiLink>
            <button type="button" onClick={onToggleManual} data-testid="camp-manual-toggle"
              aria-expanded={manualOpen}>
              {manualOpen ? 'Close Manual' : 'Field Manual'}
            </button>
            <button type="button" onClick={onToggleMuted}
              title={muted ? 'Release master mute; keep your music and effects choices.' : 'Silence music and sound effects.'} data-testid="campaign-mute-button">
              {muted ? 'Unmute all' : 'Mute all'}
            </button>
            <AudioSettings compact />
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
        <CampaignRestartDialog title={title} difficulty={difficulty} onCancel={() => setRestartOpen(false)}
          onConfirm={(selectedDifficulty) => {
            setRestartOpen(false);
            onRestart(selectedDifficulty);
          }} returnFocus={() => restartRef.current ?? filesToggleRef.current} />
      ) : null}
    </>
  );
}
