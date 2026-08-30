import { useState } from 'react';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import type { BayStatus } from './BayChrome';
import {
  exportDesign,
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

  const save = (): void => {
    if (commission !== undefined) {
      const result = commission.onCommit(design);
      if (!result.ok) onStatus({ tone: 'error', text: result.reason ?? 'refit refused' });
      return;
    }
    try {
      const { replaced } = saveToStorage(catalog, design);
      setStored(listStoredDesigns());
      onStatus({
        tone: 'ok',
        text: replaced
          ? `Saved "${design.name}", replacing the loadout already under that name.`
          : `Saved "${design.name}".`,
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
      const url = URL.createObjectURL(exportDesign(catalog, design));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${design.id}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      onStatus({ tone: 'ok', text: `Exported "${design.name}".` });
    } catch (error) {
      if (error instanceof InvalidBuildError) {
        onStatus({ tone: 'error', text: `Cannot export — ${error.issues.join('; ')}` });
        return;
      }
      throw error;
    }
  };

  const importFile = async (file: File): Promise<void> => {
    const result = parseDesign(await file.text());
    if (result.design === null) {
      onStatus({ tone: 'error', text: `Import failed — ${result.error ?? 'unknown error'}` });
      return;
    }
    onReplace(result.design);
    onStatus({ tone: 'ok', text: `Imported "${result.design.name}".` });
  };

  const load = (id: string): void => {
    const result = loadFromStorage(id);
    if (result.design === null) {
      onStatus({ tone: 'error', text: result.error ?? 'load failed' });
      return;
    }
    onReplace(result.design);
    onStatus({ tone: 'ok', text: `Loaded "${result.design.name}".` });
  };

  return { stored, save, exportFile, importFile, load };
}
