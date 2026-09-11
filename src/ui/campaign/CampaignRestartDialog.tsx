import { useRef, useState } from 'react';
import { useDialogFocus } from '../useDialogFocus';
import { CampaignDifficulty } from './CampaignDifficulty';

interface CampaignRestartDialogProps {
  title: string;
  onCancel: () => void;
  onConfirm: (difficulty: string) => void;
  difficulty?: string;
  returnFocus: () => HTMLElement | null;
}

export function CampaignRestartDialog({
  title, onCancel, onConfirm, returnFocus, difficulty = 'regular',
}: CampaignRestartDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState(difficulty);
  useDialogFocus(dialogRef, cancelRef, onCancel, returnFocus);

  return (
    <div className="camp-restart-backdrop">
      <section className="camp-restart-dialog" ref={dialogRef} role="dialog" aria-modal="true"
        aria-labelledby="camp-restart-title" aria-describedby="camp-restart-detail"
        tabIndex={-1} data-testid="camp-restart-dialog">
        <p className="camp-command-kicker">Company files</p>
        <h2 id="camp-restart-title">Restart this company?</h2>
        <p id="camp-restart-detail">
          Start a new company in <strong>{title}</strong>. Your current company will be
          kept in Load Game before the new run begins.
        </p>
        <CampaignDifficulty value={selectedDifficulty} onChange={setSelectedDifficulty} />
        <div className="camp-restart-actions">
          <button type="button" ref={cancelRef} onClick={onCancel} data-testid="camp-restart-cancel">
            Keep current run
          </button>
          <button type="button" className="camp-restart-confirm" onClick={() => onConfirm(selectedDifficulty)}
            data-testid="camp-restart-confirm">
            Restart campaign
          </button>
        </div>
      </section>
    </div>
  );
}
