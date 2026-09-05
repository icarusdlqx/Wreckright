import { useRef } from 'react';
import { useDialogFocus } from '../useDialogFocus';

interface CampaignRestartDialogProps {
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
  returnFocus: () => HTMLElement | null;
}

export function CampaignRestartDialog({
  title, onCancel, onConfirm, returnFocus,
}: CampaignRestartDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(dialogRef, cancelRef, onCancel, returnFocus);

  return (
    <div className="camp-restart-backdrop">
      <section className="camp-restart-dialog" ref={dialogRef} role="dialog" aria-modal="true"
        aria-labelledby="camp-restart-title" aria-describedby="camp-restart-detail"
        tabIndex={-1} data-testid="camp-restart-dialog">
        <p className="camp-command-kicker">Company files</p>
        <h2 id="camp-restart-title">Restart this company?</h2>
        <p id="camp-restart-detail">
          This replaces your current company in <strong>{title}</strong> with a new run.
          Export your campaign from Company files first if you want to keep a copy.
        </p>
        <div className="camp-restart-actions">
          <button type="button" ref={cancelRef} onClick={onCancel} data-testid="camp-restart-cancel">
            Keep current run
          </button>
          <button type="button" className="camp-restart-confirm" onClick={onConfirm}
            data-testid="camp-restart-confirm">
            Restart campaign
          </button>
        </div>
      </section>
    </div>
  );
}
