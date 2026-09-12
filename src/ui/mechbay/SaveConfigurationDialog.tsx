import { useEffect, useMemo, useRef, useState } from 'react';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { useDialogFocus } from '../useDialogFocus';
import { idFromName, setName } from './editor';
import './saveConfiguration.css';

function suggestedName(design: Design, stored: ReadonlySet<string>): string {
  const stem = `${design.name.replace(/\s+(Custom|Field Fit)(?:\s+\d+)?$/i, '')} Field Fit`;
  if (!stored.has(idFromName(stem))) return stem;
  for (let number = 2; number < 100; number += 1) {
    const candidate = `${stem} ${number}`;
    if (!stored.has(idFromName(candidate))) return candidate;
  }
  return `${stem} 100`;
}

export function SaveConfigurationDialog({ catalog, design, storedIds, error = null, onSave, onCancel }: {
  catalog: Catalog;
  design: Design;
  storedIds: readonly string[];
  error?: string | null;
  onSave: (design: Design) => boolean;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const stored = useMemo(() => new Set(storedIds), [storedIds]);
  const [attempted, setAttempted] = useState(false);
  const [name, setDraftName] = useState(() => suggestedName(design, stored));
  const trimmed = name.trim();
  const id = trimmed === '' ? '' : idFromName(trimmed);
  const replaces = id !== '' && stored.has(id);
  useDialogFocus(dialog, input, onCancel);
  useEffect(() => { input.current?.select(); }, []);

  const submit = (): void => {
    if (trimmed === '') return;
    setAttempted(true);
    onSave(setName(design, trimmed));
  };

  return <div className="bay-save-backdrop">
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="bay-save-title"
      className="bay-save-dialog" data-testid="bay-save-dialog" tabIndex={-1}>
      <span className="bay-save-eyebrow">Configuration library</span>
      <h2 id="bay-save-title">Save a mech variant</h2>
      <p>Name this variant. The original Prime stays available. Saved variants can be fitted in campaign preparation and selected in skirmish in this browser.</p>
      <label htmlFor="bay-save-name">Variant designation</label>
      <input ref={input} id="bay-save-name" data-testid="bay-save-name" value={name}
        onChange={(event) => setDraftName(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } }} />
      <div className="bay-save-summary" aria-label="Configuration summary">
        <span>{catalog.chassis.get(design.chassisId)?.name ?? design.chassisId}</span>
        <span>{design.mounts.length} weapons</span>
        <span>{design.ammo.length} ammo bins</span>
      </div>
      {replaces ? <p className="bay-save-warning" role="status">That name is already in your library. Saving will update that configuration.</p> : null}
      {attempted && error ? <p className="bay-save-warning" role="alert">{error}</p> : null}
      <footer>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" className="primary" onClick={submit} disabled={trimmed === ''}
          data-testid="bay-save-confirm">{replaces ? 'Update configuration' : 'Save configuration'}</button>
      </footer>
    </section>
  </div>;
}
