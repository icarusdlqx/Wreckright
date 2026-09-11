import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalog } from '../../tests/support';
import { acceptContract, startCampaign } from './campaign';
import { loadCampaign, saveCampaign, serialiseCampaign } from './save';
import { markCampaignStorageReady, peekCampaignText, campaignPersistenceStatus } from './storage';
import { activateCampaignSave, startNewSavedCampaign } from './saveLibraryActions';
import { CAMPAIGN_LIBRARY_KEY, CAMPAIGN_LIBRARY_LIMIT, deleteCheckpoint, listCampaignSaves, parseLibraryCampaign, readCampaignLibrary, saveCheckpoint } from './saveLibrary';

const ACTIVE = 'ironline.campaign';
let values: Map<string, string>;
let storage: { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };
const company = (seed = 'save-library', campaignId = 'border_dispute') => startCampaign(catalog, campaignId, seed, 'regular');

beforeEach(() => {
  values = new Map();
  storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
  vi.stubGlobal('localStorage', storage);
  markCampaignStorageReady();
});
afterEach(() => { vi.unstubAllGlobals(); markCampaignStorageReady(); });

describe('campaign save library', () => {
  it('lists legacy active and parked saves without rewriting or clearing recovery', () => {
    const active = company();
    const parked = company('parked', 'aurelian_recall');
    values.set(ACTIVE, serialiseCampaign(active));
    values.set('ironline.campaign.company.aurelian_recall', serialiseCampaign(parked));
    const original = [...values];
    expect(listCampaignSaves(catalog).entries.map(entry => entry.state?.seed)).toEqual(['save-library', 'parked']);
    expect([...values]).toEqual(original);
    expect(readCampaignLibrary().entries).toEqual([]);
  });

  it('creates named snapshots and only overwrites the explicitly selected checkpoint', () => {
    const state = company();
    saveCampaign(state);
    expect(saveCheckpoint(state, '  Before the pass  ').ok).toBe(true);
    const first = readCampaignLibrary().entries[0]!;
    state.day = 3;
    expect(saveCheckpoint(state, 'After the pass').ok).toBe(true);
    state.cbills -= 99;
    expect(saveCheckpoint(state, 'Revised plan', first.id).ok).toBe(true);
    const entries = readCampaignLibrary().entries;
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ id: first.id, name: 'Revised plan' });
    expect(JSON.parse(entries[0]!.raw).state.cbills).toBe(state.cbills);
    expect(JSON.parse(entries[1]!.raw).state.cbills).toBe(state.cbills + 99);
    expect(JSON.parse(values.get(ACTIVE)!).state.day).toBe(0);
    expect(saveCheckpoint(state, 'Missing', 'no-such-checkpoint').ok).toBe(false);
  });

  it('loads an earlier snapshot and retains later progress, then preserves both on a same-faction restart', () => {
    const earlier = company();
    saveCheckpoint(earlier, 'Day zero');
    const later = structuredClone(earlier); later.day = 4; later.cbills -= 1000;
    saveCampaign(later);
    expect(activateCampaignSave(serialiseCampaign(earlier), catalog, later).state?.day).toBe(0);
    expect(readCampaignLibrary().entries.some(entry => JSON.parse(entry.raw).state.day === 4)).toBe(true);
    const fresh = startNewSavedCampaign(catalog, earlier.campaignId, 'veteran', earlier);
    expect(fresh.ok).toBe(true);
    expect(fresh.state?.seed).not.toBe(earlier.seed);
    expect(fresh.state?.difficulty).toBe('veteran');
    expect(readCampaignLibrary().entries.some(entry => JSON.parse(entry.raw).state.day === 4)).toBe(true);
  });

  it('retains legacy parked company navigation while also protecting a previous parked run', () => {
    const active = company('active'); const previous = company('previous');
    saveCampaign(active);
    values.set('ironline.campaign.company.border_dispute', serialiseCampaign(previous));
    expect(startNewSavedCampaign(catalog, 'aurelian_recall', 'regular', active).ok).toBe(true);
    expect(JSON.parse(values.get('ironline.campaign.company.border_dispute')!).state.seed).toBe('active');
    expect(readCampaignLibrary().entries.some(entry => JSON.parse(entry.raw).state.seed === 'previous')).toBe(true);
    expect(readCampaignLibrary().entries.some(entry => JSON.parse(entry.raw).state.seed === 'active')).toBe(true);
  });

  it('does not fill the library with duplicate safety copies of identical states', () => {
    const first = company(); const second = company('second');
    saveCampaign(first);
    activateCampaignSave(serialiseCampaign(second), catalog);
    activateCampaignSave(serialiseCampaign(first), catalog);
    activateCampaignSave(serialiseCampaign(second), catalog);
    expect(readCampaignLibrary().entries).toHaveLength(2);
  });

  it('preserves malformed library bytes and valid current state without attempting replacement', () => {
    const state = company(); saveCampaign(state);
    values.set(CAMPAIGN_LIBRARY_KEY, '{damaged library');
    expect(saveCheckpoint(state, 'Attempt').ok).toBe(false);
    expect(startNewSavedCampaign(catalog, 'aurelian_recall', 'regular', state).ok).toBe(false);
    expect(values.get(CAMPAIGN_LIBRARY_KEY)).toBe('{damaged library');
    expect(loadCampaign().state?.seed).toBe(state.seed);
    expect(listCampaignSaves(catalog).entries[0]?.state?.seed).toBe(state.seed);
    expect(readCampaignLibrary().recoveryRaw).toBe('{damaged library');
  });

  it('labels a recovery session honestly without clearing its original damaged autosave', () => {
    values.set(ACTIVE, '{damaged'); loadCampaign();
    const memory = company('session-only'); saveCampaign(memory);
    const before = campaignPersistenceStatus();
    expect(listCampaignSaves(catalog, memory).entries[0]?.name).toBe('Current company · session only');
    expect(values.get(ACTIVE)).toBe('{damaged');
    expect(campaignPersistenceStatus()).toEqual(before);
  });

  it('retains corrupt individual entries while other named checkpoints remain usable', () => {
    const state = company(); saveCheckpoint(state, 'Valid');
    const data = JSON.parse(values.get(CAMPAIGN_LIBRARY_KEY)!);
    data.entries.push({ ...data.entries[0], id: 'damaged', name: 'Damaged original', raw: '{bad' });
    values.set(CAMPAIGN_LIBRARY_KEY, JSON.stringify(data));
    expect(listCampaignSaves(catalog).entries.find(entry => entry.id === 'damaged')).toMatchObject({ state: null, raw: '{bad' });
    expect(saveCheckpoint(state, 'Another').ok).toBe(true);
    expect(readCampaignLibrary().entries.find(entry => entry.id === 'damaged')?.raw).toBe('{bad');
  });

  it('rejects unknown campaign, mission, weapon and chassis references before activation', () => {
    const active = company(); saveCampaign(active);
    const unknownCampaign = company('unknown'); unknownCampaign.campaignId = 'not_in_this_game';
    expect(activateCampaignSave(serialiseCampaign(unknownCampaign), catalog)).toMatchObject({ ok: false, error: 'This game does not contain campaign “not_in_this_game”.' });
    const unknownMission = company(); acceptContract(catalog, unknownMission, 'militia_raid', 'standard');
    unknownMission.contract!.missionId = 'missing_mission';
    expect(parseLibraryCampaign(serialiseCampaign(unknownMission), catalog).error).toContain('mission');
    const unknownChassis = company(); unknownChassis.mechs[0]!.design.chassisId = 'missing_chassis';
    expect(parseLibraryCampaign(serialiseCampaign(unknownChassis), catalog).error).toContain('chassis');
    const unknownWeapon = company(); unknownWeapon.mechs[0]!.design.mounts[0]!.weaponId = 'missing_weapon';
    expect(parseLibraryCampaign(serialiseCampaign(unknownWeapon), catalog).error).toContain('weapon');
    expect(loadCampaign().state?.seed).toBe(active.seed);
    expect(values.has(CAMPAIGN_LIBRARY_KEY)).toBe(false);
  });

  it('runs existing migrations without changing the original checkpoint bytes during listing', () => {
    const legacy = JSON.parse(serialiseCampaign(company()));
    delete legacy.state.deploymentSelection;
    delete legacy.state.deploymentSeats;
    delete legacy.state.claimedRewardIds;
    const raw = JSON.stringify(legacy);
    values.set('ironline.campaign.company.border_dispute', raw);
    const listed = listCampaignSaves(catalog).entries[0]!;
    expect(listed.state?.deploymentSelection).toBe(null);
    expect(values.get('ironline.campaign.company.border_dispute')).toBe(raw);
    expect(activateCampaignSave(raw, catalog).ok).toBe(true);
    expect(loadCampaign().state?.seed).toBe('save-library');
  });

  it('refuses unreadable browser storage without attempting to activate another company', () => {
    const active = company(); saveCampaign(active);
    const before = values.get(ACTIVE);
    const setItem = vi.spyOn(storage, 'setItem');
    storage.getItem = () => { throw new Error('Storage inaccessible'); };
    expect(startNewSavedCampaign(catalog, 'aurelian_recall', 'regular', active).ok).toBe(false);
    expect(values.get(ACTIVE)).toBe(before);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('holds a switch if a safety copy fails quota, leaving autosave and memory unchanged', () => {
    const active = company(); saveCampaign(active);
    const before = values.get(ACTIVE);
    storage.setItem = (key, value) => { if (key === CAMPAIGN_LIBRARY_KEY) throw new Error('quota'); values.set(key, value); };
    expect(startNewSavedCampaign(catalog, 'aurelian_recall', 'regular', active).ok).toBe(false);
    expect(values.get(ACTIVE)).toBe(before);
    expect(peekCampaignText()).toMatchObject({ text: before, origin: 'storage' });
    expect(campaignPersistenceStatus().mode).toBe('persistent');
  });

  it('keeps a newer memory-only company and recovery lock if activation itself fails', () => {
    const active = company(); saveCampaign(active);
    const stored = values.get(ACTIVE);
    storage.setItem = (key, value) => { if (key === ACTIVE) throw new Error('quota'); values.set(key, value); };
    active.day = 8; saveCampaign(active);
    const memory = peekCampaignText(); const status = campaignPersistenceStatus();
    expect(activateCampaignSave(serialiseCampaign(company('target')), catalog, active).ok).toBe(false);
    expect(peekCampaignText()).toEqual(memory);
    expect(campaignPersistenceStatus()).toEqual(status);
    expect(values.get(ACTIVE)).toBe(stored);
    expect(readCampaignLibrary().entries.some(entry => JSON.parse(entry.raw).state.day === 8)).toBe(true);
    expect(loadCampaign().state?.day).toBe(8);
  });

  it('preserves original invalid autosave bytes before explicitly recovering with a valid checkpoint', () => {
    const damaged = '{original invalid'; values.set(ACTIVE, damaged); loadCampaign();
    const memory = company('memory'); memory.day = 2; saveCampaign(memory);
    expect(activateCampaignSave(serialiseCampaign(company('recovered')), catalog, memory).ok).toBe(true);
    expect(readCampaignLibrary().entries.some(entry => entry.kind === 'recovery' && entry.raw === damaged)).toBe(true);
    expect(readCampaignLibrary().entries.some(entry => entry.raw.includes('"memory"'))).toBe(true);
    expect(loadCampaign().state?.seed).toBe('recovered');
  });

  it('does not silently evict saves when full and still permits explicit overwrite and delete', () => {
    const state = company();
    for (let index = 0; index < CAMPAIGN_LIBRARY_LIMIT; index += 1) expect(saveCheckpoint(state, `Checkpoint ${index}`).ok).toBe(true);
    const before = values.get(CAMPAIGN_LIBRARY_KEY);
    expect(saveCheckpoint(state, 'Overflow').ok).toBe(false);
    expect(values.get(CAMPAIGN_LIBRARY_KEY)).toBe(before);
    const id = readCampaignLibrary().entries[0]!.id;
    expect(saveCheckpoint(state, 'Replacement', id).ok).toBe(true);
    expect(deleteCheckpoint(id).ok).toBe(true);
    expect(readCampaignLibrary().entries).toHaveLength(CAMPAIGN_LIBRARY_LIMIT - 1);
  });
});
