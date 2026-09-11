import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalog } from '../../tests/support';
import { briefingLanceFor } from './briefingLance';
import { berthDesign, defaultLance, factionLance, lanceEntries, lanceFaction, loadLance,
  loadLanceSelection, storeLance, type SkirmishBerth } from './lance';
import { createBattleOutfitBay } from './OutfitBayDialog';
import { skirmishForceIssue } from './skirmishForces';
import { UnsavedSkirmishRosters } from './skirmishSession';

const previousStorage = globalThis.localStorage;
let data: Map<string, string>;
let write: ReturnType<typeof vi.fn>;
beforeEach(() => {
  data = new Map();
  write = vi.fn((key: string, value: string) => data.set(key, value));
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null, setItem: write,
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() { return data.size; },
  } });
});
afterEach(() => Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previousStorage }));

function customFor(faction: 'linewrought' | 'aurelian') {
  const berth = factionLance(catalog, 'skirmish_ridge', faction)[0]!;
  const design = structuredClone(berthDesign(catalog, berth)!);
  design.id = `saved_${faction}`;
  design.name = `${faction} refit`;
  design.mounts = design.mounts.slice(1);
  return design;
}

describe('explicit skirmish faction choice', () => {
  it('stores each side and map atomically without passing metadata to runtime or mutating input', () => {
    const lance = factionLance(catalog, 'skirmish_ridge', 'linewrought');
    const before = structuredClone(lance);
    expect(storeLance('skirmish_ridge', lance, 0, 'mixed')).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(lance).toEqual(before);
    expect(loadLanceSelection(catalog, 'skirmish_ridge')).toEqual({ lance, faction: 'mixed' });
    expect(lanceFaction(catalog, loadLance(catalog, 'skirmish_ridge'))).toBe('linewrought');
    expect(JSON.stringify(loadLance(catalog, 'skirmish_ridge'))).not.toContain('factionChoice');
    expect(JSON.stringify(lanceEntries(catalog, loadLance(catalog, 'skirmish_ridge')))).not.toContain('factionChoice');
    const enemy = factionLance(catalog, 'skirmish_ridge', 'aurelian', 1);
    storeLance('skirmish_ridge', enemy, 1, 'aurelian');
    storeLance('skirmish_causeway', enemy, 1, 'mixed');
    expect(loadLanceSelection(catalog, 'skirmish_ridge').faction).toBe('mixed');
    expect(loadLanceSelection(catalog, 'skirmish_ridge', 1)).toEqual({ lance: enemy, faction: 'aurelian' });
    expect(loadLanceSelection(catalog, 'skirmish_causeway', 1).faction).toBe('mixed');
  });

  it('keeps Mixed after reordering, replacing or emptying the first berth and every other berth', () => {
    let lance = factionLance(catalog, 'skirmish_ridge', 'linewrought');
    for (const change of ['reverse', 'custom', 'empty', 'all-empty']) {
      if (change === 'reverse') lance.reverse();
      else if (change === 'custom') lance[0] = { designId: null, pilotId: lance[0]!.pilotId, design: customFor('linewrought') };
      else if (change === 'empty') lance[0] = { designId: null, pilotId: lance[0]!.pilotId, empty: true };
      else lance = lance.map(berth => ({ designId: null, pilotId: berth.pilotId, empty: true }));
      storeLance('skirmish_ridge', lance, 0, 'mixed');
      const restored = loadLanceSelection(catalog, 'skirmish_ridge');
      expect(restored).toEqual({ lance, faction: 'mixed' });
      lance = restored.lance;
    }
  });

  it('infers legacy choices only on load and never rewrites malformed or legacy data', () => {
    const lance = factionLance(catalog, 'skirmish_ridge', 'aurelian');
    const key = 'ironline.lance.skirmish_ridge';
    for (const raw of [JSON.stringify(lance), JSON.stringify([{ ...lance[0], factionChoice: 'unknown' }, ...lance.slice(1)])]) {
      data.set(key, raw);
      expect(loadLanceSelection(catalog, 'skirmish_ridge')).toEqual({ lance, faction: 'aurelian' });
      expect(data.get(key)).toBe(raw);
    }
    data.delete(key);
    const fallback = loadLanceSelection(catalog, 'skirmish_ridge');
    for (const raw of ['[]', '[null]', '{}', 'broken', JSON.stringify([{ factionChoice: 'aurelian' }, ...lance.slice(1)])]) {
      data.set(key, raw);
      expect(loadLanceSelection(catalog, 'skirmish_ridge')).toEqual(fallback);
      expect(data.get(key)).toBe(raw);
    }
    expect(write).not.toHaveBeenCalled();
  });

  it('retains failed faction changes with their roster across route remounts and clears only the saved side', () => {
    const lance = factionLance(catalog, 'skirmish_ridge', 'linewrought');
    storeLance('skirmish_ridge', lance, 0, 'linewrought');
    const raw = data.get('ironline.lance.skirmish_ridge');
    write.mockImplementation(() => { throw new Error('quota'); });
    const session = new UnsavedSkirmishRosters();
    session.record('skirmish_ridge', lance, 'Your lance', storeLance('skirmish_ridge', lance, 0, 'mixed'), 'mixed');
    session.record('enemy.skirmish_ridge', lance, 'Enemy lance', false, 'linewrought');
    expect(data.get('ironline.lance.skirmish_ridge')).toBe(raw);
    expect(session.factions()).toEqual({ skirmish_ridge: 'mixed', 'enemy.skirmish_ridge': 'linewrought' });
    expect(session.lances().skirmish_ridge).toEqual(lance);
    session.record('enemy.skirmish_ridge', lance, 'Enemy lance', true, 'mixed');
    expect(session.factions()).toEqual({ skirmish_ridge: 'mixed' });
    expect(session.labels()).toEqual(['Your lance']);
  });

  it.each(['linewrought', 'aurelian', 'mixed'] as const)('filters stock and custom hulls for %s and rejects stale off-faction callbacks', (faction) => {
    const saved = [customFor('linewrought'), customFor('aurelian')];
    for (const design of saved) data.set(`ironline.design.${design.id}`, JSON.stringify(design));
    data.set('ironline.design.broken', '{}');
    const onLance = vi.fn();
    const lance = defaultLance(catalog, 'skirmish_ridge');
    const view = briefingLanceFor(catalog, 'skirmish_ridge', lance, onLance, vi.fn(), undefined, faction);
    const expected = [...catalog.designs.values()].filter(design => {
      const chassis = catalog.chassis.get(design.chassisId)!;
      return chassis.frame === 'mech' && (faction === 'mixed' || chassis.faction === faction);
    });
    expect(view.designs.map(option => option.value)).toEqual(expected.map(design => design.id));
    expect(view.saved.map(option => option.value).sort()).toEqual(saved.filter(design => faction === 'mixed'
      || catalog.chassis.get(design.chassisId)!.faction === faction).map(design => `saved:${design.id}`).sort());
    for (const design of saved) {
      onLance.mockClear();
      view.onDesign(0, `saved:${design.id}`);
      const allowed = faction === 'mixed' || catalog.chassis.get(design.chassisId)!.faction === faction;
      expect(onLance).toHaveBeenCalledTimes(allowed ? 1 : 0);
      if (allowed) expect(onLance.mock.calls[0]?.[0][0].design).toEqual(design);
    }
    for (const design of catalog.designs.values()) {
      onLance.mockClear();
      view.onDesign(0, design.id);
      expect(onLance).toHaveBeenCalledTimes(expected.some(candidate => candidate.id === design.id) ? 1 : 0);
    }
    onLance.mockClear();
    view.onDesign(0, 'missing');
    view.onDesign(0, 'saved:broken');
    expect(onLance).not.toHaveBeenCalled();
  });

  it.each(['linewrought', 'aurelian'] as const)('starts an empty %s refit with its own hull and refuses another faction without closing', (faction) => {
    const lance: SkirmishBerth[] = defaultLance(catalog, 'skirmish_ridge').map(berth => ({ ...berth, designId: null, empty: true }));
    const set = vi.fn(); const close = vi.fn();
    const bay = createBattleOutfitBay(catalog, lance, 0, set, close, 'enemy', faction)!;
    expect(catalog.chassis.get(bay.design.chassisId)?.faction).toBe(faction);
    expect(bay.onCommit(customFor(faction === 'linewrought' ? 'aurelian' : 'linewrought')).ok).toBe(false);
    expect(set).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
    const own = customFor(faction);
    expect(bay.onCommit(own).ok).toBe(true);
    expect(set.mock.calls[0]?.[0][0]).toEqual({ designId: null, pilotId: lance[0]!.pilotId, design: own });
    expect(close).toHaveBeenCalledOnce();
  });

  it('blocks inconsistent faction metadata before launch without changing the saved roster', () => {
    const lance = factionLance(catalog, 'skirmish_ridge', 'linewrought');
    expect(skirmishForceIssue(catalog, 'skirmish_ridge', lance, 'Your', 'aurelian')).toMatch(/Your lance is set to Aurelian/);
    expect(skirmishForceIssue(catalog, 'skirmish_ridge', lance, 'Enemy', 'mixed')).toBeNull();
  });
});
