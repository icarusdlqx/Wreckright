import { useRef, useState } from 'react';
import type { Campaign } from '../../schema/campaign';
import { useDialogFocus } from '../useDialogFocus';
import { CampaignDifficulty } from './CampaignDifficulty';
import './campaignChooser.css';

interface CampaignChooserProps {
  campaigns: readonly Campaign[];
  currentId: string;
  onClose: () => void;
  onStart: (campaignId: string, difficulty: string) => void;
  initial?: boolean;
  difficulty?: string;
}

export function CampaignChooser({ campaigns, currentId, onClose, onStart,
  initial = false, difficulty = 'regular' }: CampaignChooserProps) {
  const choices = [...campaigns].sort((left, right) => left.name.localeCompare(right.name));
  const [selectedId, setSelectedId] = useState(currentId);
  const [selectedDifficulty, setSelectedDifficulty] = useState(difficulty);
  const current = campaigns.find((campaign) => campaign.id === currentId);
  const selected = campaigns.find((campaign) => campaign.id === selectedId);
  const isCurrent = selectedId === currentId;
  const dialogRef = useRef<HTMLElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  useDialogFocus(dialogRef, selectRef, onClose);

  return (
    <div className="campaign-chooser-backdrop">
      <section
        className="campaign-chooser"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-chooser-title"
        tabIndex={-1}
        data-testid="campaign-chooser"
      >
        <p className="campaign-chooser-kicker">{initial ? 'New company' : 'Campaign archive'}</p>
        <h3 id="campaign-chooser-title">Choose a side of the Recall</h3>
        {initial ? <p>Choose your company and the opposition it will face. Difficulty stays with this campaign.</p> : <p>
          The current save is <strong>{current?.name ?? currentId}</strong>. Starting another
          campaign replaces that save slot; export it first if you want to keep a copy.
        </p>}
        <label>
          Campaign
          <select
            ref={selectRef}
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            data-testid="campaign-choice"
          >
            {choices.map((campaign) => (
              <option
                key={campaign.id}
                value={campaign.id}
                data-testid={`campaign-choice-${campaign.id}`}
              >
                {campaign.name}
              </option>
            ))}
          </select>
        </label>
        <CampaignDifficulty value={selectedDifficulty} onChange={setSelectedDifficulty} />
        <p className="campaign-chooser-selection">
          {isCurrent && !initial ? 'This is the campaign already in progress.' : `Selected: ${selected?.name ?? selectedId}`}
        </p>
        <div className="campaign-chooser-actions">
          <button type="button" onClick={onClose} data-testid="campaign-choice-cancel">
            {initial ? 'Back to home' : 'Keep current run'}
          </button>
          <button
            type="button"
            disabled={isCurrent && !initial}
            onClick={() => onStart(selectedId, selectedDifficulty)}
            data-testid="campaign-choice-start"
          >
            Start selected campaign
          </button>
        </div>
      </section>
    </div>
  );
}
