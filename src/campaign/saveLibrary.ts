import { z } from 'zod';
import type { Catalog } from '../schema/load';
import { deserialiseCampaign, serialiseCampaign } from './save';
import { readCompanySlot } from './companySlots';
import { campaignPersistenceStatus, peekCampaignText } from './storage';
import type { CampaignState } from './types';

export const CAMPAIGN_LIBRARY_KEY = 'ironline.campaign.saves';
export const CAMPAIGN_LIBRARY_LIMIT = 24;
const EntrySchema = z.strictObject({
  id: z.string().min(1).max(100), name: z.string().trim().min(1).max(60),
  kind: z.enum(['checkpoint', 'safety', 'recovery']),
  savedAt: z.string().datetime(), raw: z.string(),
});
const LibrarySchema = z.strictObject({ version: z.literal(1), entries: z.array(EntrySchema).max(CAMPAIGN_LIBRARY_LIMIT) });
export type CampaignCheckpoint = z.infer<typeof EntrySchema>;
export interface CampaignLibrary {
  entries: CampaignCheckpoint[];
  error: string | null;
  recoveryRaw: string | null;
}
export interface CampaignSaveEntry {
  id: string;
  name: string;
  kind: 'current' | 'parked' | CampaignCheckpoint['kind'];
  savedAt: string | null;
  raw: string;
  state: CampaignState | null;
  error: string | null;
}
export interface SaveResult { ok: boolean; error: string | null }

/** Read-only: listing old files neither migrates their bytes nor clears recovery. */
export function readCampaignLibrary(): CampaignLibrary {
  let raw: string | null = null;
  try {
    if (globalThis.localStorage === undefined) throw new Error('Storage unavailable');
    raw = globalThis.localStorage.getItem(CAMPAIGN_LIBRARY_KEY);
    if (raw === null) return { entries: [], error: null, recoveryRaw: null };
    const parsed = LibrarySchema.safeParse(JSON.parse(raw));
    if (!parsed.success || new Set(parsed.data.entries.map(entry => entry.id)).size !== parsed.data.entries.length) {
      return { entries: [], error: 'The save library needs recovery. Export its original file; your current autosave remains available.', recoveryRaw: raw };
    }
    return { entries: parsed.data.entries, error: null, recoveryRaw: null };
  } catch {
    return { entries: [], error: raw === null ? 'Browser storage is unavailable.' : 'The save library cannot be read. Its original file is preserved.', recoveryRaw: raw };
  }
}

/** Save files keep their existing migration path, then check content needed to open them. */
export function parseLibraryCampaign(raw: string, catalog: Catalog): { state: CampaignState | null; error: string | null } {
  try {
    const parsed = deserialiseCampaign(raw, catalog);
    if (parsed.state === null) return parsed;
    const state = parsed.state;
    if (!catalog.campaigns.has(state.campaignId)) return { state: null, error: `This game does not contain campaign “${state.campaignId}”.` };
    if (catalog.rules.difficulty.tiers[state.difficulty] === undefined) return { state: null, error: `Unknown campaign difficulty “${state.difficulty}”.` };
    if (state.contract !== null && !catalog.missions.has(state.contract.missionId)) return { state: null, error: `This game does not contain mission “${state.contract.missionId}”.` };
    for (const mech of state.mechs) {
      const design = mech.design;
      if (!catalog.chassis.has(design.chassisId)) return { state: null, error: `This game does not contain chassis “${design.chassisId}”.` };
      for (const mount of [...design.mounts, ...design.ammo]) {
        if (!catalog.weapons.has(mount.weaponId)) return { state: null, error: `This game does not contain weapon “${mount.weaponId}”.` };
      }
      for (const id of [design.heatSinkId, ...design.equipment.map(fit => fit.equipmentId)]) {
        if (!catalog.equipment.has(id)) return { state: null, error: `This game does not contain equipment “${id}”.` };
      }
    }
    for (const item of state.store) {
      const items = item.kind === 'weapon' ? catalog.weapons : catalog.equipment;
      if (!items.has(item.itemId)) return { state: null, error: `This game does not contain stored equipment “${item.itemId}”.` };
    }
    return parsed;
  } catch { return { state: null, error: 'This campaign cannot be opened by this version of the game. Its original file is preserved.' }; }
}

export function listCampaignSaves(catalog: Catalog, current?: CampaignState): { entries: CampaignSaveEntry[]; library: CampaignLibrary } {
  const library = readCampaignLibrary();
  const entries: CampaignSaveEntry[] = [];
  const active = peekCampaignText();
  const raw = current === undefined ? active.kind === 'found' ? active.text : null : serialiseCampaign(current);
  if (raw !== null) entries.push({ id: 'current', name: campaignPersistenceStatus().mode === 'memory-only' ? 'Current company · session only' : 'Current company · autosave', kind: 'current', savedAt: null, raw, ...parseLibraryCampaign(raw, catalog) });
  for (const campaign of catalog.campaigns.values()) {
    const slot = readCompanySlot(campaign.id);
    if (slot.raw === undefined || entries.some(entry => entry.raw === slot.raw)) continue;
    entries.push({ id: `parked:${campaign.id}`, name: 'Parked company', kind: 'parked', savedAt: null, raw: slot.raw, ...parseLibraryCampaign(slot.raw, catalog), ...(slot.error ? { state: null, error: slot.error } : {}) });
  }
  for (const entry of [...library.entries].reverse()) entries.push({ ...entry, ...parseLibraryCampaign(entry.raw, catalog) });
  return { entries, library };
}

export function writeCampaignLibrary(entries: CampaignCheckpoint[]): SaveResult {
  // Refuse to turn a damaged or unreadable library into an empty one.
  const prior = readCampaignLibrary();
  if (prior.error !== null) return { ok: false, error: prior.error };
  if (entries.length > CAMPAIGN_LIBRARY_LIMIT) return { ok: false, error: 'The save library is full (24 saves). Export and delete a save, or overwrite a named checkpoint.' };
  try {
    const data = LibrarySchema.parse({ version: 1, entries });
    globalThis.localStorage.setItem(CAMPAIGN_LIBRARY_KEY, JSON.stringify(data));
    return { ok: true, error: null };
  } catch { return { ok: false, error: 'The save could not be written. Browser storage may be full; export a backup before trying again.' }; }
}

export function saveCheckpoint(state: CampaignState, name: string, overwriteId?: string): SaveResult {
  const library = readCampaignLibrary();
  if (library.error !== null) return { ok: false, error: library.error };
  const label = name.trim();
  if (label.length === 0 || label.length > 60) return { ok: false, error: 'Give this checkpoint a name (1–60 characters).' };
  const previous = library.entries.find(entry => entry.id === overwriteId);
  if (overwriteId !== undefined && previous === undefined) return { ok: false, error: 'That checkpoint no longer exists. Save a new copy.' };
  const entry: CampaignCheckpoint = { id: previous?.id ?? crypto.randomUUID(), name: label, kind: 'checkpoint', savedAt: new Date().toISOString(), raw: serialiseCampaign(state) };
  return writeCampaignLibrary(previous === undefined ? [...library.entries, entry] : library.entries.map(item => item.id === previous.id ? entry : item));
}

export function deleteCheckpoint(id: string): SaveResult {
  const library = readCampaignLibrary();
  if (library.error !== null) return { ok: false, error: library.error };
  if (!library.entries.some(entry => entry.id === id)) return { ok: false, error: 'That checkpoint no longer exists.' };
  return writeCampaignLibrary(library.entries.filter(entry => entry.id !== id));
}
