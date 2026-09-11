import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalog } from '../../tests/support';
import { startCampaign } from './campaign';
import { parkCompany, readCompanySlot } from './companySlots';
import { loadCampaign, saveCampaign } from './save';
import { markCampaignStorageReady } from './storage';

describe('separate company slots', () => {
  let values: Map<string, string>;
  beforeEach(() => {
    values = new Map();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
    markCampaignStorageReady();
  });
  afterEach(() => { vi.unstubAllGlobals(); markCampaignStorageReady(); });
  it('retains both factions without renaming the legacy active save', () => {
    const line = startCampaign(catalog, 'border_dispute', 'line-company');
    const gold = startCampaign(catalog, 'aurelian_recall', 'gold-company');
    line.difficultyConfigured = gold.difficultyConfigured = true;
    line.day = 3;
    saveCampaign(line);
    expect(parkCompany(line).ok).toBe(true);
    expect(saveCampaign(gold).ok).toBe(true);
    expect(parkCompany(gold).ok).toBe(true);
    expect(readCompanySlot(line.campaignId).state).toMatchObject({ seed: 'line-company', day: 3 });
    expect(readCompanySlot(gold.campaignId).state?.seed).toBe('gold-company');
    expect(loadCampaign().state?.seed).toBe('gold-company');
    expect(values.has('ironline.campaign')).toBe(true);
  });
  it('refuses a switch during save recovery and leaves malformed parked data available', () => {
    values.set('ironline.campaign', '{broken');
    values.set('ironline.campaign.company.aurelian_recall', '{parked-broken');
    loadCampaign();
    const line = startCampaign(catalog, 'border_dispute', 'unsafe-switch');
    line.difficultyConfigured = true;
    expect(parkCompany(line).ok).toBe(false);
    expect(readCompanySlot('aurelian_recall').state).toBeNull();
    expect(readCompanySlot('aurelian_recall').error).toBeTruthy();
    expect(values.get('ironline.campaign')).toBe('{broken');
    expect(values.get('ironline.campaign.company.aurelian_recall')).toBe('{parked-broken');
    markCampaignStorageReady();
    const gold = startCampaign(catalog, 'aurelian_recall', 'new-active');
    gold.difficultyConfigured = true;
    expect(parkCompany(gold).ok).toBe(false);
    expect(readCompanySlot('aurelian_recall').raw).toBe('{parked-broken');
  });
  it('holds the company when storage refuses the archive write', () => {
    const line = startCampaign(catalog, 'border_dispute', 'quota');
    line.difficultyConfigured = true;
    saveCampaign(line);
    const active = values.get('ironline.campaign');
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: () => { throw new Error('quota'); } });
    expect(parkCompany(line).ok).toBe(false);
    expect(values.get('ironline.campaign')).toBe(active);
  });
});
