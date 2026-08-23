import { useState } from 'react';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { LinewroughtBuilder } from './LinewroughtBuilder';

export interface BayStatus {
  tone: 'ok' | 'error';
  text: string;
}

interface Props {
  catalog: Catalog;
  design: Design;
  commissionTitle?: string;
  commissionCancelLabel?: string;
  stored: readonly string[];
  saveable: boolean;
  status: BayStatus | null;
  onNameChange: (name: string) => void;
  onDesignPick: (design: Design) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onReset: () => void;
  onExit: () => void;
  onSave: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onLoad: (id: string) => void;
}

export function BayChrome({
  catalog,
  design,
  commissionTitle,
  commissionCancelLabel,
  stored,
  saveable,
  status,
  onNameChange,
  onDesignPick,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onReset,
  onExit,
  onSave,
  onExport,
  onImport,
  onLoad,
}: Props) {
  const commissioned = commissionTitle !== undefined;
  const [builderOpen, setBuilderOpen] = useState(false);
  const undoEnabled = canUndo && onUndo !== undefined;
  const redoEnabled = canRedo && onRedo !== undefined;
  return (
    <>
      <header className="bay-top">
        {commissioned ? (
          <span className="bay-commission" data-testid="bay-commission">
            Refit — {commissionTitle}
          </span>
        ) : (
          <>
            <input
              className="bay-name"
              value={design.name}
              aria-label="Design name"
              onChange={(event) => onNameChange(event.target.value)}
              data-testid="design-name"
            />
            <select
              value={catalog.designs.has(design.id) ? design.id : ''}
              onChange={(event) => {
                const picked = catalog.designs.get(event.target.value);
                if (picked !== undefined) onDesignPick(structuredClone(picked));
              }}
              data-testid="design-picker"
              aria-label="Stock design"
            >
              {catalog.designs.has(design.id) ? null : (
                <option value="">{design.name} (custom)</option>
              )}
              {[...catalog.designs.values()]
                .filter((entry) => catalog.chassis.get(entry.chassisId)?.frame === 'mech')
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={() => setBuilderOpen(true)}
              data-testid="linewrought-builder-open"
            >
              Build Linewrought
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onUndo}
          disabled={!undoEnabled}
          title={undoEnabled ? 'Undo the last loadout change' : 'Nothing to undo'}
          data-testid="bay-undo"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!redoEnabled}
          title={redoEnabled ? 'Redo the last undone change' : 'Nothing to redo'}
          data-testid="bay-redo"
        >
          Redo
        </button>
        <button
          type="button"
          onClick={onReset}
          title="Restore the factory loadout and undo every change on the gantry."
          data-testid="bay-reset-stock"
        >
          Reset to stock
        </button>
        <button type="button" onClick={onExit} data-testid="bay-exit">
          {commissioned ? commissionCancelLabel ?? 'Back to manifest' : 'Back to skirmish'}
        </button>
      </header>

      <footer className="bay-actions">
        <button
          type="button"
          onClick={onSave}
          disabled={!saveable}
          title={saveable ? 'Save this build' : 'Fix the build before saving'}
          data-testid="bay-save"
        >
          {commissioned ? 'Commit refit' : 'Save build'}
        </button>

        {commissioned ? null : (
          <>
            <button type="button" onClick={onExport} disabled={!saveable} data-testid="bay-export">
              Export JSON
            </button>
            <label className="bay-import">
              Import JSON
              <input
                type="file"
                accept="application/json"
                data-testid="bay-import"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file !== undefined) onImport(file);
                }}
              />
            </label>
            <select
              value=""
              onChange={(event) => {
                if (event.target.value !== '') onLoad(event.target.value);
              }}
              data-testid="bay-stored"
              aria-label="Saved builds"
            >
              <option value="">Saved builds…</option>
              {stored.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </>
        )}

        <span className={`bay-status ${status?.tone ?? ''}`} data-testid="bay-status" role="status">
          {status?.text ?? (saveable ? 'Build is legal.' : 'Build is not legal.')}
        </span>
      </footer>
      {builderOpen ? (
        <LinewroughtBuilder
          catalog={catalog}
          initialChassisId={design.chassisId}
          onCancel={() => setBuilderOpen(false)}
          onCreate={(created) => {
            setBuilderOpen(false);
            onDesignPick(created);
          }}
        />
      ) : null}
    </>
  );
}
