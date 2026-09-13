import { useRef, useState } from 'react';
import type { Catalog } from '../../schema/load';
import type { CampaignState } from '../../campaign/types';
import { campaignOutcomeCount } from '../../campaign/history';
import { deleteCheckpoint, listCampaignSaves, saveCheckpoint, type CampaignSaveEntry } from '../../campaign/saveLibrary';
import { downloadCampaignFile } from './campaignDownload';
import { useDialogFocus } from '../useDialogFocus';
import { FactionLogo } from '../FactionLogo';
import './campaignSaves.css';

export interface CampaignSaveDialogProps {
  mode: 'save' | 'load';
  catalog: Catalog;
  current?: CampaignState;
  onClose: () => void;
  onSaved: (message: string) => void;
  onLoad: (entry: CampaignSaveEntry) => string | null;
  onImport: (raw: string) => string | null;
}

export function CampaignSaveDialog({ mode, catalog, current, onClose, onSaved, onLoad, onImport }: CampaignSaveDialogProps) {
  const [listing, setListing] = useState(() => listCampaignSaves(catalog, current));
  const [selectedId, setSelectedId] = useState(listing.entries[0]?.id ?? '');
  const [name, setName] = useState(`Day ${current?.day ?? 0} checkpoint`);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<'overwrite' | 'delete' | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const selected = listing.entries.find(entry => entry.id === selectedId);
  const selectedCampaign = selected?.state === null || selected?.state === undefined ? undefined : catalog.campaigns.get(selected.state.campaignId);
  const editable = selected !== undefined && selected.kind !== 'current' && selected.kind !== 'parked';
  useDialogFocus(dialogRef, headingRef, () => confirmation === null ? onClose() : setConfirmation(null));
  const refresh = (): void => setListing(listCampaignSaves(catalog, current));
  const exportRaw = (raw: string, filename: string): void => downloadCampaignFile(new Blob([raw], { type: 'application/json' }), filename);
  const save = (overwrite = false): void => {
    if (current === undefined) return;
    const result = saveCheckpoint(current, name, overwrite ? selected?.id : undefined);
    if (!result.ok) { setNotice(result.error); setConfirmation(null); return; }
    onSaved(`Checkpoint “${name.trim()}” saved. Autosave remains your current company.`);
    onClose();
  };
  const choose = (entry: CampaignSaveEntry): void => {
    setSelectedId(entry.id); setConfirmation(null); setNotice(null);
    if (mode === 'save' && entry.kind === 'checkpoint') setName(entry.name);
  };

  return <div className="campaign-saves-backdrop">
    <section ref={dialogRef} className="campaign-saves" role="dialog" aria-modal="true" aria-labelledby="campaign-saves-title" data-testid="campaign-save-dialog">
      <header className="campaign-saves-heading">
        <div><p className="campaign-saves-kicker">Company records</p><h2 id="campaign-saves-title" tabIndex={-1} ref={headingRef}>{mode === 'save' ? 'Save Game' : 'Load Game'}</h2></div>
        <button type="button" onClick={onClose} data-testid="save-dialog-close" aria-label="Close saved games">Close</button>
      </header>
      <p className="campaign-saves-intro">Your company autosaves between missions. Named checkpoints keep your company between missions, not a battle in progress. Saves stay in this browser; export a copy to keep elsewhere.</p>
      {mode === 'save' ? <form className="campaign-save-name" onSubmit={(event) => { event.preventDefault(); save(); }}>
        <label htmlFor="campaign-save-name">Checkpoint name<input id="campaign-save-name" data-testid="save-name" value={name} maxLength={60} onChange={event => { setName(event.target.value); setConfirmation(null); }} /></label>
        <button type="submit" className="campaign-save-primary" disabled={current === undefined || name.trim() === '' || listing.library.error !== null}
          title={current === undefined ? 'Open a campaign before making a checkpoint.' : name.trim() === '' ? 'Enter a checkpoint name.' : listing.library.error ?? 'Keep this named copy in the current browser.'}
          data-testid="save-new-checkpoint">Save new checkpoint</button>
      </form> : null}
      {listing.library.error === null ? null : <div className="campaign-save-warning" role="alert"><p>{listing.library.error}</p>{listing.library.recoveryRaw === null ? null : <button type="button" data-testid="save-export-library-recovery" onClick={() => exportRaw(listing.library.recoveryRaw!, 'ironmuster-save-library-recovery.json')}>Export original library</button>}</div>}
      <div className="campaign-saves-workspace">
        <div className="campaign-saves-list" aria-label="Saved campaigns" data-testid="save-list">
          {listing.entries.length === 0 ? <p className="campaign-saves-empty">No saved campaigns yet. Start a company from the main menu.</p> : listing.entries.map(entry => {
            const campaign = entry.state === null ? undefined : catalog.campaigns.get(entry.state.campaignId);
            return <button type="button" key={entry.id} className={`campaign-save-row campaign-save-row--${campaign?.presentation?.faction ?? 'unknown'}`}
              data-campaign-faction={campaign?.presentation?.faction} aria-pressed={entry.id === selectedId} onClick={() => choose(entry)} data-testid={`save-entry-${entry.id}`}>
              {campaign?.presentation === undefined ? <span className="campaign-save-icon" aria-hidden="true">▤</span> : <FactionLogo faction={campaign.presentation.faction} size={30} decorative />}
              <span><strong>{entry.name}</strong><span>{entry.state === null ? 'Needs recovery · original file available' : `${campaign?.name} · Day ${entry.state.day}`}</span><small>{entry.kind === 'current' ? entry.name.includes('session only') ? 'Not saved to this browser · export a copy' : 'Continue from here' : entry.kind === 'parked' ? 'Earlier company slot' : entry.kind === 'safety' ? 'Kept automatically before switching' : entry.kind === 'recovery' ? 'Original bytes preserved' : 'Named checkpoint'}</small></span>
            </button>;
          })}
        </div>
        <aside className="campaign-save-detail" data-testid="save-detail">
          {selected === undefined ? <p>Select a saved campaign to see its company record.</p> : <>
            <span className="campaign-saves-kicker">Selected record</span><h3>{selected.name}</h3>
            {selected.state === null ? <p role="alert">{selected.error}</p> : <>
              <p>{selectedCampaign?.name}</p>
              <p className="campaign-save-faction">{selectedCampaign?.presentation?.faction === 'aurelian' ? 'Aurelian Stock' : 'Linewrought'}</p>
              <dl><div><dt>Local time</dt><dd>Day {selected.state.day}</dd></div><div><dt>Difficulty</dt><dd>{selected.state.difficulty}</dd></div><div><dt>Treasury</dt><dd>{selected.state.cbills.toLocaleString('en-GB')} C</dd></div><div><dt>Company</dt><dd>{selected.state.mechs.length} mechs · {selected.state.pilots.filter(pilot => !pilot.dead).length} pilots</dd></div><div><dt>Field record</dt><dd>{campaignOutcomeCount(selected.state)} missions resolved</dd></div></dl>
              <p className="campaign-save-mission">{selected.state.finished ? 'Campaign ended' : selected.state.contract === null ? 'Between contracts' : `Preparing: ${catalog.missions.get(selected.state.contract.missionId)?.name ?? selected.state.contract.missionId}`}</p>
              <small className="campaign-save-code">Run {selected.state.seed}</small>
            </>}
            {selected.savedAt === null ? null : <small>Saved {new Date(selected.savedAt).toLocaleString()}</small>}
            <div className="campaign-save-tools">
              <button type="button" data-testid="save-export-selected" onClick={() => exportRaw(selected.raw, `ironmuster-${selected.id.replace(/[^a-z0-9-]/gi, '-')}.json`)}>Export selected</button>
              {editable ? <button type="button" data-testid="save-delete-selected" onClick={() => setConfirmation('delete')}>Delete</button> : null}
              {mode === 'save' && editable ? <button type="button" data-testid="save-overwrite-selected" disabled={name.trim() === '' || listing.library.error !== null}
                title={name.trim() === '' ? 'Enter a checkpoint name.' : listing.library.error ?? 'Replace only this named checkpoint.'}
                onClick={() => setConfirmation('overwrite')}>Overwrite selected</button> : null}
            </div>
          </>}
        </aside>
      </div>
      {confirmation === null || selected === undefined ? null : <div className="campaign-save-confirm" role="alert" data-testid="save-confirmation"><p>{confirmation === 'delete' ? 'Delete' : 'Overwrite'} “{selected.name}”? {confirmation === 'delete' ? 'Export it first if you want to keep a copy. The current company stays open.' : 'This replaces only the selected checkpoint with your current company.'}</p><button type="button" data-testid="save-confirm-cancel" onClick={() => setConfirmation(null)}>Keep checkpoint</button><button type="button" data-testid="save-confirm" onClick={() => {
        if (confirmation === 'overwrite') { save(true); return; }
        const result = deleteCheckpoint(selected.id); setConfirmation(null); setNotice(result.ok ? 'Checkpoint deleted. Your current company is unchanged.' : result.error); refresh();
      }}>{confirmation === 'delete' ? 'Delete checkpoint' : 'Overwrite checkpoint'}</button></div>}
      {notice === null ? null : <p role="status" className="campaign-save-notice" data-testid="save-notice">{notice}</p>}
      <footer className="campaign-saves-footer">
        <label className="campaign-save-import">Import save<input type="file" accept="application/json,.json" data-testid="save-import" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (file !== undefined) void file.text().then(raw => setNotice(onImport(raw))).catch(() => setNotice('That file could not be read. Your current company is unchanged.'));
        }} /></label>
        <span>{mode === 'load' ? 'Your current company is kept before loading another save.' : `${listing.library.entries.length} / 24 saved records`}</span>
        {mode !== 'load' ? null : <button type="button" className="campaign-save-primary" disabled={selected?.state === null || selected === undefined}
          title={selected === undefined ? 'Select a saved campaign first.' : selected.state === null ? 'This record must be exported or recovered before it can be loaded.' : 'Your current company is kept automatically before switching.'}
          data-testid="save-load-selected" onClick={() => { if (selected !== undefined) setNotice(onLoad(selected)); }}>{selected?.kind === 'current' ? 'Continue current company' : 'Load selected save'}</button>}
      </footer>
    </section>
  </div>;
}
