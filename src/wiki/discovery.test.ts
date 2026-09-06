import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalog } from '../../tests/support';
import { startCampaign } from '../campaign/campaign';
import { loadCampaign, saveCampaign, serialiseCampaign } from '../campaign/save';
import { campaignPersistenceStatus, markCampaignStorageReady, peekCampaignText } from '../campaign/storage';
import { readWikiDiscovery } from './discovery';
import { PUBLIC_DISCOVERY } from './library';

const CAMPAIGN_KEY = 'ironline.campaign';
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let values: Map<string, string>;
let getItem: ReturnType<typeof vi.fn<(key: string) => string | null>>;
let setItem: ReturnType<typeof vi.fn<(key: string, value: string) => void>>;
let removeItem: ReturnType<typeof vi.fn<(key: string) => void>>;

function installStorage(): void {
  getItem = vi.fn((key: string) => values.get(key) ?? null);
  setItem = vi.fn((key: string, value: string) => { values.set(key, value); });
  removeItem = vi.fn((key: string) => { values.delete(key); });
  const storage: Storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem,
    setItem,
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
}

describe.sequential('read-only wiki discoveries', () => {
  beforeEach(() => {
    values = new Map([['unrelated.setting', 'keep']]);
    installStorage();
    markCampaignStorageReady();
  });
  afterEach(() => {
    markCampaignStorageReady();
    vi.restoreAllMocks();
    if (originalStorage === undefined) delete (globalThis as { localStorage?: Storage }).localStorage;
    else Object.defineProperty(globalThis, 'localStorage', originalStorage);
  });

  it('reads current persisted progress without rewriting or creating a company', () => {
    const company = startCampaign(catalog, 'aurelian_recall', 'wiki-current');
    company.completedNodes = ['first_warrant', 'root_exchange'];
    const raw = serialiseCampaign(company);
    values.set(CAMPAIGN_KEY, raw);
    const status = campaignPersistenceStatus();

    expect(readWikiDiscovery(catalog)).toEqual({ campaignId: 'aurelian_recall', completedNodes: company.completedNodes });
    expect(values.get(CAMPAIGN_KEY)).toBe(raw);
    expect(values.get('unrelated.setting')).toBe('keep');
    expect(campaignPersistenceStatus()).toEqual(status);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('returns public records for a missing company without changing persistence', () => {
    const status = campaignPersistenceStatus();
    expect(readWikiDiscovery()).toEqual(PUBLIC_DISCOVERY);
    expect([...values.entries()]).toEqual([['unrelated.setting', 'keep']]);
    expect(campaignPersistenceStatus()).toEqual(status);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it.each(['{broken', JSON.stringify({ version: 1, state: { campaignId: 'border_dispute' } })])(
    'leaves corrupt storage and recovery bookkeeping untouched: %s', (raw) => {
      values.set(CAMPAIGN_KEY, raw);
      const status = campaignPersistenceStatus();
      expect(readWikiDiscovery(catalog)).toEqual(PUBLIC_DISCOVERY);
      expect(values.get(CAMPAIGN_KEY)).toBe(raw);
      expect(campaignPersistenceStatus()).toEqual(status);
      expect(setItem).not.toHaveBeenCalled();
      expect(removeItem).not.toHaveBeenCalled();
    },
  );

  it('keeps the newer memory-only company ahead of a valid older disk save', () => {
    const older = startCampaign(catalog, 'border_dispute', 'wiki-recovery');
    older.completedNodes = ['militia_raid'];
    const disk = serialiseCampaign(older);
    values.set(CAMPAIGN_KEY, disk);
    const current = structuredClone(older);
    current.completedNodes.push('pass_skirmish');
    setItem.mockImplementation(() => { throw new DOMException('quota reached', 'QuotaExceededError'); });
    expect(saveCampaign(current).ok).toBe(false);
    const status = campaignPersistenceStatus();
    const memory = peekCampaignText();
    getItem.mockClear();

    expect(readWikiDiscovery(catalog)).toEqual({ campaignId: current.campaignId, completedNodes: current.completedNodes });
    expect(peekCampaignText()).toEqual(memory);
    expect(campaignPersistenceStatus()).toEqual(status);
    expect(values.get(CAMPAIGN_KEY)).toBe(disk);
    expect(getItem).not.toHaveBeenCalled();
    expect(saveCampaign(current).error).toBe('campaign storage is locked for recovery');
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(loadCampaign(catalog)).toMatchObject({ source: 'memory', state: { completedNodes: current.completedNodes } });
  });

  it('preserves damaged recovery bytes while reading a replacement session company', () => {
    const damaged = '{recover this original';
    values.set(CAMPAIGN_KEY, damaged);
    expect(loadCampaign(catalog).source).toBe('invalid');
    const company = startCampaign(catalog, 'aurelian_recall', 'wiki-replacement');
    company.completedNodes = ['first_warrant'];
    expect(saveCampaign(company).ok).toBe(false);
    const status = campaignPersistenceStatus();
    const memory = peekCampaignText();

    expect(readWikiDiscovery(catalog)).toEqual({ campaignId: company.campaignId, completedNodes: company.completedNodes });
    expect(peekCampaignText()).toEqual(memory);
    expect(campaignPersistenceStatus()).toEqual(status);
    expect(campaignPersistenceStatus().recoveryRaw).toBe(damaged);
    expect(values.get(CAMPAIGN_KEY)).toBe(damaged);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('does not enter recovery mode merely because archive storage access is denied', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => { throw new DOMException('access denied', 'SecurityError'); },
    });
    const status = campaignPersistenceStatus();
    expect(readWikiDiscovery(catalog)).toEqual(PUBLIC_DISCOVERY);
    expect(campaignPersistenceStatus()).toEqual(status);
    expect(values.get('unrelated.setting')).toBe('keep');
  });

  it('keeps an existing recovery lock when storage later becomes inaccessible', () => {
    const damaged = '{original invalid save';
    values.set(CAMPAIGN_KEY, damaged);
    loadCampaign(catalog);
    const status = campaignPersistenceStatus();
    getItem.mockImplementation(() => { throw new DOMException('access denied', 'SecurityError'); });

    expect(readWikiDiscovery(catalog)).toEqual(PUBLIC_DISCOVERY);
    expect(campaignPersistenceStatus()).toEqual(status);
    expect(values.get(CAMPAIGN_KEY)).toBe(damaged);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });
});
