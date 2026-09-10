import { useState } from 'react';
import type { CampaignState } from '../../campaign/types';
import type { Catalog } from '../../schema/load';
import { activateCampaignSave, startNewSavedCampaign } from '../../campaign/saveLibraryActions';
import type { CampaignActivation } from '../../campaign/saveLibraryActions';
import { CampaignSaveDialog } from './CampaignSaveDialog';

/** Owns explicit file actions; callers only adopt a state after durable activation succeeds. */
export function useCampaignFiles({ catalog, current, onAdopt, onContinue, onNotice }: {
  catalog: Catalog;
  current?: CampaignState;
  onAdopt: (state: CampaignState, fresh: boolean, message: string) => void;
  onContinue?: () => void;
  onNotice: (message: string) => void;
}) {
  const [mode, setMode] = useState<'save' | 'load' | null>(null);
  const adopt = (result: CampaignActivation, fresh: boolean, message: string): string | null => {
    if (!result.ok || result.state === null) {
      const error = result.error ?? 'The campaign could not be opened.';
      onNotice(error); return error;
    }
    setMode(null); onAdopt(result.state, fresh, message); return null;
  };
  const importSave = (raw: string): string | null => adopt(activateCampaignSave(raw, catalog, current, 'Before importing'), false, 'Save imported. Your previous company is kept in Load Game.');
  const startNew = (campaignId: string, difficulty: string): boolean => adopt(startNewSavedCampaign(catalog, campaignId, difficulty, current), true, 'New campaign started. Previous companies are kept in Load Game.') === null;
  return {
    openSave: () => setMode('save'), openLoad: () => setMode('load'), importSave, startNew,
    loadRaw: (raw: string) => adopt(activateCampaignSave(raw, catalog, current), false, 'Campaign loaded. Your previous company is kept in Load Game.'),
    dialog: mode === null ? null : <CampaignSaveDialog mode={mode} catalog={catalog} current={current}
      onClose={() => setMode(null)} onSaved={onNotice} onImport={importSave} onLoad={entry => {
        if (entry.kind === 'current') { setMode(null); onContinue?.(); return null; }
        return adopt(activateCampaignSave(entry.raw, catalog, current), false, 'Campaign loaded. Your previous company is kept in Load Game.');
      }} />,
  };
}
