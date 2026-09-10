import type { Catalog } from '../schema/load';
import type { CampaignState } from './types';
import { serialiseCampaign } from './save';
import { activateCampaignText, campaignPersistenceStatus, peekCampaignText } from './storage';
import { createCampaignSeed, startFreshCampaign } from './freshness';
import { parkCompany, readCompanySlot } from './companySlots';
import { parseLibraryCampaign, readCampaignLibrary, writeCampaignLibrary, type CampaignCheckpoint, type SaveResult } from './saveLibrary';

export interface CampaignActivation extends SaveResult { state: CampaignState | null }

/** Preserve every distinct version first, including damaged originals and newer memory-only work. */
function preserveCurrent(catalog: Catalog, current: CampaignState | undefined, reason: string): SaveResult {
  const stored = peekCampaignText(true);
  if (stored.kind === 'unavailable') return { ok: false, error: 'The current autosave cannot be read. Switching is held so it stays safe.' };
  const session = peekCampaignText();
  const rawCopies = new Set<string>();
  if (stored.kind === 'found') rawCopies.add(stored.text);
  if (session.kind === 'found') rawCopies.add(session.text);
  if (current !== undefined) {
    rawCopies.add(serialiseCampaign(current));
    const parked = readCompanySlot(current.campaignId);
    if (parked.raw !== undefined) rawCopies.add(parked.raw);
  }
  const recovery = campaignPersistenceStatus().recoveryRaw;
  if (recovery !== null) rawCopies.add(recovery);
  const library = readCampaignLibrary();
  if (library.error !== null) return { ok: false, error: library.error };
  const additions: CampaignCheckpoint[] = [];
  for (const raw of rawCopies) {
    const parsed = parseLibraryCampaign(raw, catalog);
    // The unconfigured day-zero onboarding placeholder is not an established company.
    if (parsed.state !== null && !parsed.state.difficultyConfigured) continue;
    if (library.entries.some(entry => entry.raw === raw)) continue;
    additions.push({ id: crypto.randomUUID(), name: parsed.state === null ? 'Original save · recovery' : `${reason} · Day ${parsed.state.day}`,
      kind: parsed.state === null ? 'recovery' : 'safety', savedAt: new Date().toISOString(), raw });
  }
  return additions.length === 0 ? { ok: true, error: null } : writeCampaignLibrary([...library.entries, ...additions]);
}

export function activateCampaignSave(raw: string, catalog: Catalog, current?: CampaignState, reason = 'Before loading'): CampaignActivation {
  const parsed = parseLibraryCampaign(raw, catalog);
  if (parsed.state === null) return { ok: false, error: parsed.error, state: null };
  const session = peekCampaignText();
  const active = current ?? (session.kind === 'found' ? parseLibraryCampaign(session.text, catalog).state ?? undefined : undefined);
  const kept = preserveCurrent(catalog, active, reason);
  if (!kept.ok) return { ...kept, state: null };
  // Continue supporting the earlier faction picker without sacrificing an older parked run.
  // Damaged parked originals remain untouched and still exportable from that picker.
  if (active !== undefined && active.campaignId !== parsed.state.campaignId && campaignPersistenceStatus().mode === 'persistent' && readCompanySlot(active.campaignId).error === null) {
    const parked = parkCompany(active);
    if (!parked.ok) return { ok: false, state: null, error: parked.error ?? 'Company switch held. Your current company is unchanged.' };
  }
  const saved = activateCampaignText(serialiseCampaign(parsed.state));
  return saved.ok ? { ok: true, error: null, state: parsed.state } : {
    ok: false, error: 'The selected campaign could not be written. Your current company remains open; its preserved copy is in Load Game.', state: null,
  };
}

export function startNewSavedCampaign(catalog: Catalog, campaignId: string, difficulty: string, current?: CampaignState): CampaignActivation {
  if (!catalog.campaigns.has(campaignId) || catalog.rules.difficulty.tiers[difficulty] === undefined) return { ok: false, state: null, error: 'Choose an available campaign and difficulty.' };
  const fresh = startFreshCampaign(catalog, campaignId, createCampaignSeed, () => undefined, difficulty);
  return activateCampaignSave(serialiseCampaign(fresh), catalog, current, 'Before new campaign');
}
