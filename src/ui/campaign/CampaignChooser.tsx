import { useRef, useState } from 'react';
import type { Campaign } from '../../schema/campaign';
import { useDialogFocus } from '../useDialogFocus';
import { CompanyChoiceCard } from './CompanyChoiceCard';
import { downloadCampaignFile } from './campaignDownload';
import { readCompanySlot } from '../../campaign/companySlots';
import { CampaignDifficulty } from './CampaignDifficulty';
import './campaignChooser.css';
import { campaignStory } from '../../campaign/story';

interface CampaignChooserProps {
  campaigns: readonly Campaign[];
  currentId: string;
  onClose: () => void;
  onStart: (campaignId: string, difficulty: string) => void;
  initial?: boolean;
  onResume?: (campaignId: string) => void;
  difficulty?: string;
  notice?: string | null;
}

export function CampaignChooser({ campaigns, currentId, onClose, onStart,
  initial = false, difficulty = 'regular', onResume, notice }: CampaignChooserProps) {
  const choices = [...campaigns].sort((left, right) => left.name.localeCompare(right.name));
  const [selectedId, setSelectedId] = useState(campaigns.some((campaign) => campaign.id === currentId) ? currentId : choices[0]?.id ?? currentId);
  const [selectedDifficulty, setSelectedDifficulty] = useState(difficulty);
  const current = campaigns.find((campaign) => campaign.id === currentId);
  const selected = campaigns.find((campaign) => campaign.id === selectedId);
  const story = selected === undefined ? undefined : campaignStory(selected);
  const slot = readCompanySlot(selectedId);
  const isCurrent = selectedId === currentId;
  const damagedSlot = slot.error !== null && slot.raw !== undefined;
  const resumable = (!isCurrent || initial) && slot.state !== null;
  const dialogRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useDialogFocus(dialogRef, headingRef, onClose);

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
        <h3 id="campaign-chooser-title" ref={headingRef} tabIndex={-1}>Choose a side of the Recall</h3>
        {initial ? <p>One campaign for each faction, with its own company, contracts and story. Choose your side and difficulty; difficulty stays with that campaign.</p> : <p>
          The current save is <strong>{current?.name ?? currentId}</strong>. Each faction has its own parked company slot. Switching preserves this company; exports remain available for extra copies.
        </p>}
        <div className="company-choice-grid">{choices.map((campaign) => <CompanyChoiceCard key={campaign.id} campaign={campaign} selected={selectedId === campaign.id} onSelect={() => setSelectedId(campaign.id)} />)}</div>
        <label className="company-choice-select">
          Campaign
          <select
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
        {story === undefined ? null : <p className="company-story-preview"><strong>{story.title}</strong> {story.summary}</p>}
        {selected?.demoSupplies === undefined ? null : <p className="company-demo-note"><strong>Demo equipment:</strong> start with {selected.demoSupplies.items.filter(item => item.kind === 'weapon').length} loose weapon types for refitting. Earn advanced weapons through later contracts.</p>}
        {resumable || (isCurrent && !initial) ? null : <CampaignDifficulty value={selectedDifficulty} onChange={setSelectedDifficulty} />}
        {resumable ? <p className="campaign-chooser-selection">Saved company: day {slot.state?.day} · {slot.state?.completedNodes.length} contracts completed. Resume keeps its difficulty and roster.</p> : null}
        {slot.error === null ? null : <div role="alert"><p>{slot.error} {damagedSlot ? 'The original saved company is preserved. Export it for recovery before starting another run in this slot.' : 'Company slots cannot be read here. A new company can run in memory; export it before leaving.'}</p>
          {slot.raw === undefined ? null : <button type="button" data-testid="campaign-slot-recovery" onClick={() => downloadCampaignFile(new Blob([slot.raw!], { type: 'application/json' }), `${selectedId}-recovery.json`)}>Export original company save</button>}</div>}
        <p className="campaign-chooser-selection">
          {isCurrent && !initial ? 'This is the campaign already in progress.' : `Selected: ${selected?.name ?? selectedId}`}
        </p>
        {notice ? <p role="status">{notice}</p> : null}
        <div className="campaign-chooser-actions">
          <button type="button" onClick={onClose} data-testid="campaign-choice-cancel">
            {initial ? 'Back to home' : 'Keep current run'}
          </button>
          {resumable && onResume !== undefined ? <button type="button" onClick={() => onResume(selectedId)} data-testid="campaign-choice-resume">Resume saved company</button> : null}
          <button
            type="button"
            disabled={(isCurrent && !initial) || resumable || damagedSlot}
            onClick={() => onStart(selectedId, selectedDifficulty)}
            data-testid="campaign-choice-start"
          >
            {resumable ? 'Resume the saved company first' : 'Start selected campaign'}
          </button>
        </div>
      </section>
    </div>
  );
}
