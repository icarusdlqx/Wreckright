import { useEffect, useMemo, useRef, useState } from 'react';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { designIdentityLabel } from '../designLabel';
import type { BayStatus, StoredLoadoutOption } from './BayChrome';
import {
  exportDesign, setName, idFromName,
  currentStockDesign,
  InvalidBuildError,
  DesignStorageError,
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
  onReplace: (design: Design, status?: BayStatus) => void;
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
  const callbacks = useRef({ onReplace, onStatus });
  callbacks.current = { onReplace, onStatus };
  const importSequence = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; importSequence.current += 1; };
  }, []);
  const [stored, setStored] = useState<string[]>(() => listStoredDesigns());
  const storedOptions = useMemo<StoredLoadoutOption[]>(() => stored.map((id, index) => {
    const loaded = loadFromStorage(id, catalog).design;
    return {
      id,
      label: loaded === null
        ? `Saved loadout ${index + 1} — unavailable`
        : designIdentityLabel(catalog, loaded),
    };
  }).filter((entry) => commission === undefined || loadFromStorage(entry.id, catalog).design?.chassisId === design.chassisId), [catalog, stored, commission, design.chassisId]);

  const save = (candidate: Design = design): boolean => {
    let current = currentStockDesign(catalog, candidate);
    if (catalog.designs.has(current.id)) {
      let designation = `${current.name} Field Fit`;
      let index = 2;
      while (listStoredDesigns().includes(idFromName(designation))) designation = `${current.name} Field Fit ${index++}`;
      current = setName(current, designation);
    }
    try {
      const { replaced } = saveToStorage(catalog, current);
      setStored(listStoredDesigns());
      if (commission !== undefined) {
        const result = commission.onCommit(current);
        if (!result.ok) onStatus({ tone: 'error', text: `Variant saved to the library. ${result.reason ?? 'Refit refused'}` });
        return result.ok;
      }
      onStatus({
        tone: 'ok',
        text: replaced
          ? `Saved "${current.name}", replacing the loadout already under that name.`
          : `Saved "${current.name}".`,
      });
      return true;
    } catch (error) {
      if (error instanceof DesignStorageError) {
        onStatus({ tone: 'error', text: error.message });
        return false;
      }
      if (error instanceof InvalidBuildError) {
        onStatus({ tone: 'error', text: `Cannot save — ${error.issues.join('; ')}` });
        return false;
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
    const request = ++importSequence.current;
    const current = (): boolean => mounted.current && request === importSequence.current;
    let text: string;
    try { text = await file.text(); }
    catch {
      if (current()) callbacks.current.onStatus({ tone: 'error', text: 'Could not read that file. Your current draft is unchanged.' });
      return;
    }
    if (!current()) return;
    const result = parseDesign(text, catalog);
    if (result.design === null) {
      callbacks.current.onStatus({ tone: 'error', text: `Import failed — ${result.error ?? 'unknown error'}` });
      return;
    }
    if (commission !== undefined && result.design.chassisId !== design.chassisId) {
      onStatus({ tone: 'error', text: 'Choose a variant for this chassis.' }); return;
    }
    if (catalog.chassis.get(result.design.chassisId)?.frame !== 'mech') {
      callbacks.current.onStatus({ tone: 'error', text: 'The workshop accepts mech loadouts. Your current draft is unchanged.' }); return;
    }
    callbacks.current.onReplace(result.design, { tone: 'ok', text: `Imported "${result.design.name}".` });
  };

  const load = (id: string): void => {
    importSequence.current += 1;
    const result = loadFromStorage(id, catalog);
    if (result.design === null) {
      onStatus({ tone: 'error', text: result.error ?? 'load failed' });
      return;
    }
    if (commission !== undefined && result.design.chassisId !== design.chassisId) {
      onStatus({ tone: 'error', text: 'Choose a variant for this chassis.' }); return;
    }
    if (catalog.chassis.get(result.design.chassisId)?.frame !== 'mech') {
      onStatus({ tone: 'error', text: 'The workshop accepts mech loadouts. Your current draft is unchanged.' }); return;
    }
    onReplace(result.design, { tone: 'ok', text: `Loaded "${result.design.name}".` });
  };

  return { stored: storedOptions, save, exportFile, importFile, load };
}
