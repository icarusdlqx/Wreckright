import { afterEach, describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import {
  DesignStorageError, exportDesign, InvalidBuildError, listStoredDesigns, loadFromStorage, parseDesign,
  saveToStorage, setName,
} from './editor';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
afterEach(() => {
  if (originalStorage === undefined) Reflect.deleteProperty(globalThis, 'localStorage');
  else Object.defineProperty(globalThis, 'localStorage', originalStorage);
});
const draft = () => setName(structuredClone(catalog.designs.get('sentinel_brawler')!), 'Storage recovery refit');

describe('mechbay storage recovery', () => {
  it('does not report success when persistent storage is absent, and keeps an exportable draft', async () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined });
    const design = draft();
    const before = structuredClone(design);
    expect(() => saveToStorage(catalog, design)).toThrow(DesignStorageError);
    expect(design).toEqual(before);
    expect(listStoredDesigns()).toEqual([]);
    expect(loadFromStorage(design.id).design).toBeNull();
    expect(parseDesign(await exportDesign(catalog, design).text(), catalog).design).toEqual(design);
  });

  it('preserves the existing saved variant and current draft when a replacement exceeds quota', () => {
    const design = draft();
    const old = JSON.stringify(design);
    const key = `ironline.design.${design.id}`;
    const store = new Map([[key, old]]);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (id: string) => store.get(id) ?? null,
      setItem: () => { throw new DOMException('Quota exhausted', 'QuotaExceededError'); },
    } });
    design.mounts.splice(1, 1);
    const changed = structuredClone(design);
    expect(() => saveToStorage(catalog, design)).toThrow(/export the loadout/i);
    expect(store.get(key)).toBe(old);
    expect(design).toEqual(changed);
    expect(loadFromStorage(design.id, catalog).design?.mounts).toHaveLength(changed.mounts.length + 1);
  });

  it('handles access denied at the storage getter without crashing catalogue or load operations', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true,
      get: () => { throw new DOMException('Storage blocked', 'SecurityError'); },
    });
    expect(listStoredDesigns()).toEqual([]);
    expect(loadFromStorage('saved_refit', catalog)).toMatchObject({ design: null, error: expect.stringMatching(/unavailable/i) });
    expect(() => saveToStorage(catalog, draft())).toThrow(DesignStorageError);
  });

  it('handles reads and key enumeration becoming unavailable after the bay has opened', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      length: 1,
      key: () => { throw new DOMException('Enumeration blocked', 'SecurityError'); },
      getItem: () => { throw new DOMException('Read blocked', 'SecurityError'); },
      setItem: () => { throw new DOMException('Write blocked', 'SecurityError'); },
    } });
    expect(listStoredDesigns()).toEqual([]);
    expect(loadFromStorage('saved_refit', catalog).error).toMatch(/unavailable/i);
    expect(() => saveToStorage(catalog, draft())).toThrow(DesignStorageError);
  });

  it('leaves malformed saved contents intact for recovery', () => {
    const raw = '{"id":"old_refit", broken';
    const store = new Map([['ironline.design.old_refit', raw]]);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      length: store.size,
      key: (index: number) => [...store.keys()][index] ?? null,
      getItem: (key: string) => store.get(key) ?? null,
    } });
    expect(listStoredDesigns()).toEqual(['old_refit']);
    expect(loadFromStorage('old_refit', catalog)).toMatchObject({ design: null, error: expect.stringMatching(/JSON/i) });
    expect(store.get('ironline.design.old_refit')).toBe(raw);
  });

  it('refuses a different display name whose slug collides with an existing saved loadout', () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    } });
    const first = setName(draft(), 'Scout A');
    const second = setName(draft(), 'Scout-A');
    second.mounts.splice(1, 1);
    expect(second.id).toBe(first.id);
    saveToStorage(catalog, first);
    expect(() => saveToStorage(catalog, second)).toThrow(InvalidBuildError);
    expect(loadFromStorage(first.id, catalog).design).toEqual(first);
    const update = structuredClone(first);
    update.mounts.splice(1, 1);
    expect(saveToStorage(catalog, update)).toEqual({ replaced: true });
    expect(loadFromStorage(first.id, catalog).design).toEqual(update);
  });

  it('preserves a custom name which would otherwise impersonate an authored stock ID', () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    } });
    const design = setName(draft(), 'Sentinel Brawler');
    expect(design.id).not.toBe('sentinel_brawler');
    saveToStorage(catalog, design);
    expect(loadFromStorage(design.id, catalog).design?.name).toBe('Sentinel Brawler');
    expect(store.has('ironline.design.sentinel_brawler')).toBe(false);
  });

  it('rejects imported unknown chassis before a draft can be replaced', () => {
    const design = draft();
    for (const chassisId of ['nonexistent_chassis']) {
      expect(parseDesign(JSON.stringify({ ...design, chassisId }), catalog)).toMatchObject({
        design: null, error: expect.any(String),
      });
    }
  });

  it('still opens a known chassis with an illegal fitting so the player can repair the imported build', () => {
    const design = draft();
    design.mounts.push(...structuredClone(design.mounts), ...structuredClone(design.mounts));
    const parsed = parseDesign(JSON.stringify(design), catalog);
    expect(parsed.error).toBeNull();
    expect(parsed.design).toEqual(design);
    expect(() => saveToStorage(catalog, design)).toThrow(InvalidBuildError);
  });
});
