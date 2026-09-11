import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { defaultLance, factionLance, lanceFaction, loadLance, storeLance } from './lance';
import { loadPlayerDifficulty, skirmishForceIssue, skirmishMapChoices, storePlayerDifficulty } from './skirmishForces';
import { createBattleOutfitBay } from './OutfitBayDialog';
import { briefingLanceFor } from './briefingLance';

const previousStorage = globalThis.localStorage;
beforeEach(() => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  } });
});
afterEach(() => Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previousStorage }));

describe('independent skirmish forces', () => {
  it('offers a valid pure battle on every terrain map with no hidden extra enemy waves', () => {
    const choices = skirmishMapChoices(catalog);
    expect(new Set(choices.map((choice) => choice.id))).toEqual(new Set(catalog.maps.keys()));
    for (const choice of choices) {
      const mission = catalog.missions.get(choice.missionId)!;
      expect(mission.mapId).toBe(choice.id);
      expect(mission.triggers).toHaveLength(0);
      expect(mission.lances.map((lance) => lance.team)).toEqual([0, 1]);
      expect(skirmishForceIssue(catalog, mission.id, defaultLance(catalog, mission.id), 'Your')).toBeNull();
      expect(skirmishForceIssue(catalog, mission.id, defaultLance(catalog, mission.id, 1), 'Enemy')).toBeNull();
    }
  });

  it('lets either side deliberately select each faction or a mixed lance', () => {
    for (const team of [0, 1]) for (const faction of ['linewrought', 'aurelian', 'mixed'] as const) {
      const lance = factionLance(catalog, 'skirmish_ridge', faction, team);
      expect(lanceFaction(catalog, lance)).toBe(faction);
      expect(skirmishForceIssue(catalog, 'skirmish_ridge', lance, team === 0 ? 'Your' : 'Enemy')).toBeNull();
      expect(lance.map((berth) => berth.pilotId)).toEqual(defaultLance(catalog, 'skirmish_ridge', team).map((berth) => berth.pilotId));
    }
  });

  it('round-trips a customized enemy loadout without overwriting the friendly lance', () => {
    const friendly = factionLance(catalog, 'skirmish_ridge', 'linewrought');
    const enemy = factionLance(catalog, 'skirmish_ridge', 'aurelian', 1);
    const custom = structuredClone(catalog.designs.get(enemy[0]!.designId!)!);
    custom.name = 'Enemy test refit';
    enemy[0] = { designId: null, design: custom, pilotId: enemy[0]!.pilotId };
    enemy[1] = { designId: null, pilotId: enemy[1]!.pilotId, empty: true };
    storeLance('skirmish_ridge', friendly);
    storeLance('skirmish_ridge', enemy, 1);
    expect(loadLance(catalog, 'skirmish_ridge')).toEqual(friendly);
    expect(loadLance(catalog, 'skirmish_ridge', 1)).toEqual(enemy);
    expect(loadLance(catalog, 'skirmish_causeway', 1)).toEqual(defaultLance(catalog, 'skirmish_causeway', 1));
  });

  it('recovers a stored lance with an unknown chassis without deleting its data', () => {
    const lance = defaultLance(catalog, 'skirmish_ridge', 1);
    const invalid = structuredClone(catalog.designs.get(lance[0]!.designId!)!);
    invalid.chassisId = 'missing_frame';
    lance[0] = { designId: null, pilotId: lance[0]!.pilotId, design: invalid };
    storeLance('skirmish_ridge', lance, 1);
    const raw = localStorage.getItem('ironline.lance.enemy.skirmish_ridge');
    expect(loadLance(catalog, 'skirmish_ridge', 1)).toEqual(defaultLance(catalog, 'skirmish_ridge', 1));
    expect(localStorage.getItem('ironline.lance.enemy.skirmish_ridge')).toBe(raw);
  });

  it('previews the player crew experience in the briefing stats', () => {
    const lance = defaultLance(catalog, 'skirmish_ridge');
    const view = briefingLanceFor(catalog, 'skirmish_ridge', lance, () => undefined, () => undefined, 'elite');
    expect(view.berths[0]!.pilot!.gunnery).toBe(5);
    expect(catalog.pilots.get(lance[0]!.pilotId)!.gunnery).toBe(4);
  });

  it('keeps player experience per map and recovers from unknown stored tiers', () => {
    storePlayerDifficulty('skirmish_ridge', 'elite');
    expect(loadPlayerDifficulty(catalog, 'skirmish_ridge')).toBe('elite');
    expect(loadPlayerDifficulty(catalog, 'skirmish_causeway')).toBe('regular');
    storePlayerDifficulty('skirmish_ridge', 'missing');
    expect(loadPlayerDifficulty(catalog, 'skirmish_ridge')).toBe('regular');
  });

  it('explains empty, duplicated-pilot and overweight forces before deployment', () => {
    const base = defaultLance(catalog, 'skirmish_ridge');
    expect(skirmishForceIssue(catalog, 'skirmish_ridge', base.map((berth) => ({ ...berth, empty: true })), 'Your')).toMatch(/at least one/);
    const duplicate = structuredClone(base);
    duplicate[1]!.pilotId = duplicate[0]!.pilotId;
    expect(skirmishForceIssue(catalog, 'skirmish_ridge', duplicate, 'Enemy')).toMatch(/same pilot/);
    const heavy = base.map((berth) => ({ ...berth, designId: 'bulwark_assault' }));
    expect(skirmishForceIssue(catalog, 'skirmish_ridge', heavy, 'Your')).toMatch(/over/);
  });

  it('committing a refit into an empty berth actually fills that berth', () => {
    const lance = defaultLance(catalog, 'skirmish_ridge');
    lance[0] = { ...lance[0]!, designId: null, empty: true };
    let next = lance;
    const bay = createBattleOutfitBay(catalog, lance, 0, (value) => { next = value; }, () => undefined, 'enemy');
    expect(bay?.title).toBe('Enemy berth 1');
    expect(bay?.onCommit(catalog.designs.get('sentinel_brawler')!).ok).toBe(true);
    expect(next[0]?.empty).toBeUndefined();
    expect(next[0]?.design?.id).toBe('sentinel_brawler');
  });
});
