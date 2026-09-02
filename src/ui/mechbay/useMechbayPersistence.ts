import { useMemo, useState } from 'react';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { designIdentityLabel } from '../designLabel';
import type { BayStatus, StoredLoadoutOption } from './BayChrome';
import {
  exportDesign,
  currentStockDesign,
  InvalidBuildError,
  listStoredDesigns,
  loadFromStorage,
  parseDesign,
  saveToStorage,
} from './editor';

interface CommissionPersistence {
  onCommit: (design: Design) => { ok: boolean; reason: string | null };
}

interface MechbayPersistenceOptions {
  catalog: Catalog;
  design: Design;
  commission: CommissionPersistence | undefined;
  onReplace: (design: Design) => void;
  onStatus: (status: BayStatus | null) => void;
}

/** Keeps file and local-storage plumbing out of the loadout interaction controller. */
export function useMechbayPersistence({
  catalog,
  design,
  commission,
  onReplace,
  onStatus,
}: MechbayPersistenceOptions) {
  const [stored, setStored] = useState<string[]>(() => listStoredDesigns());
  const storedOptions = useMemo<StoredLoadoutOption[]>(() => stored.map((id, index) => {
    const loaded = loadFromStorage(id, catalog).design;
    return {
      id,
      label: loaded === null
        ? `Saved loadout ${index + 1} — unavailable`
        : designIdentityLabel(catalog, loaded),
    };
  }), [catalog, stored]);

  const save = (): void => {
    const current = currentStockDesign(catalog, design);
    if (commission !== undefined) {
      const result = commission.onCommit(current);
      if (!result.ok) onStatus({ tone: 'error', text: result.reason ?? 'refit refused' });
      return;
    }
    try {
      const { replaced } = saveToStorage(catalog, current);
      setStored(listStoredDesigns());
      onStatus({
        tone: 'ok',
        text: replaced
          ? `Saved "${current.name}", replacing the loadout already under that name.`
          : `Saved "${current.name}".`,
      });
    } catch (error) {
      if (error instanceof InvalidBuildError) {
        onStatus({ tone: 'error', text: `Cannot save — ${error.issues.join('; ')}` });
        return;
      }
      throw error;
    }
  };

  const exportFile = (): void => {
    try {
      const current = currentStockDesign(catalog, design);
      const url = URL.createObjectURL(exportDesign(catalog, current));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${design.id}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      onStatus({ tone: 'ok', text: `Exported "${current.name}".` });
    } catch (error) {
      if (error instanceof InvalidBuildError) {
        onStatus({ tone: 'error', text: `Cannot export — ${error.issues.join('; ')}` });
        return;
      }
      throw error;
    }
  };

  const importFile = async (file: File): Promise<void> => {
    const result = parseDesign(await file.text(), catalog);
    if (result.design === null) {
      onStatus({ tone: 'error', text: `Import failed — ${result.error ?? 'unknown error'}` });
      return;
    }
    onReplace(result.design);
    onStatus({ tone: 'ok', text: `Imported "${result.design.name}".` });
  };

  const load = (id: string): void => {
    const result = loadFromStorage(id, catalog);
    if (result.design === null) {
      onStatus({ tone: 'error', text: result.error ?? 'load failed' });
      return;
    }
    onReplace(result.design);
    onStatus({ tone: 'ok', text: `Loaded "${result.design.name}".` });
  };

  return { stored: storedOptions, save, exportFile, importFile, load };
}
