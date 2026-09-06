import type { CampaignState } from './types';
import { deserialiseCampaign, serialiseCampaign } from './save';
import { campaignPersistenceStatus } from './storage';

const slotKey = (id: string): string => `ironline.campaign.company.${id}`;

/** The legacy active slot stays authoritative. Parking a company must succeed before switching away. */
export function parkCompany(state: CampaignState): { ok: boolean; error?: string } {
  if (!state.difficultyConfigured) return { ok: true };
  if (campaignPersistenceStatus().mode === 'memory-only') return { ok: false, error: 'Resolve or export the current save before switching companies.' };
  try {
    if (globalThis.localStorage === undefined) throw new Error('Storage unavailable');
    const prior = readCompanySlot(state.campaignId);
    if (prior.error !== null) return { ok: false, error: 'The parked company needs recovery. Its original save has been preserved; export it from Company files → Campaigns.' };
    globalThis.localStorage.setItem(slotKey(state.campaignId), serialiseCampaign(state));
    return { ok: true };
  } catch { return { ok: false, error: 'The company could not be parked. Export your save before switching.' }; }
}

export function readCompanySlot(campaignId: string): { state: CampaignState | null; error: string | null; raw?: string } {
  try {
    const raw = globalThis.localStorage?.getItem(slotKey(campaignId));
    if (raw === undefined || raw === null) return { state: null, error: null };
    const parsed = deserialiseCampaign(raw);
    if (parsed.state !== null && parsed.state.campaignId !== campaignId) return { state: null, error: 'Saved company does not match this slot.', raw };
    return { ...parsed, raw };
  } catch { return { state: null, error: 'Company slots are unavailable.' }; }
}
