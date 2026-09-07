import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { readLastSkirmishMission, storeLastSkirmishMission } from './skirmishPreferences';

const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const key = 'ironline.skirmish.lastMap';
let entries: Map<string, string>;

beforeEach(() => {
  entries = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (name: string) => entries.get(name) ?? null,
    setItem: (name: string, value: string) => entries.set(name, value),
  } });
});

afterEach(() => {
  if (previousStorage === undefined) Reflect.deleteProperty(globalThis, 'localStorage');
  else Object.defineProperty(globalThis, 'localStorage', previousStorage);
});

describe('last skirmish map preference', () => {
  it('opens Ridge for an existing profile without a map preference', () => {
    entries.set('ironline.lance.skirmish_foundry_district', 'existing saved refit');
    expect(readLastSkirmishMission(catalog)).toBe('skirmish_ridge');
    expect(entries.has(key)).toBe(false);
  });

  it('remembers a catalogued map without touching saved rosters, crew or campaign data', () => {
    const existing = [
      ['ironline.lance.skirmish_foundry_district', 'saved friendly refit'],
      ['ironline.lance.enemy.skirmish_foundry_district', 'saved enemy refit'],
      ['ironline.skirmish.playerDifficulty.skirmish_foundry_district', 'elite'],
      ['ironline.campaign', 'saved campaign'],
    ] as const;
    for (const [name, value] of existing) entries.set(name, value);
    expect(storeLastSkirmishMission(catalog, 'skirmish_foundry_district')).toBe(true);
    expect(entries.get(key)).toBe('foundry_district');
    expect(readLastSkirmishMission(catalog)).toBe('skirmish_foundry_district');
    for (const [name, value] of existing) expect(entries.get(name)).toBe(value);
    expect(storeLastSkirmishMission(catalog, 'skirmish_ridge')).toBe(true);
    expect(readLastSkirmishMission(catalog)).toBe('skirmish_ridge');
  });

  it.each(['missing_map', 'authority_root_exchange', 'training_ground', 'skirmish_foundry_district', ''])(
    'falls back safely for stale or non-map preference %s', (value) => {
      entries.set(key, value);
      expect(readLastSkirmishMission(catalog)).toBe('skirmish_ridge');
      expect(entries.get(key)).toBe(value);
    },
  );

  it('checks current catalogue availability instead of trusting a once-valid map id', () => {
    storeLastSkirmishMission(catalog, 'skirmish_foundry_district');
    const maps = new Map(catalog.maps);
    maps.delete('foundry_district');
    const changed = { ...catalog, maps };
    expect(readLastSkirmishMission(changed)).toBe('skirmish_ridge');
    expect(storeLastSkirmishMission(changed, 'skirmish_foundry_district')).toBe(false);
  });

  it.each(['authority_root_exchange', 'training_ground', 'missing_mission'])(
    'does not let %s replace a remembered skirmish map', (missionId) => {
      storeLastSkirmishMission(catalog, 'skirmish_foundry_district');
      expect(storeLastSkirmishMission(catalog, missionId)).toBe(false);
      expect(readLastSkirmishMission(catalog)).toBe('skirmish_foundry_district');
    },
  );

  it.each(['blocked', 'absent', 'quota'] as const)('remains usable with %s storage', (failure) => {
    if (failure === 'blocked') {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true,
        get() { throw new Error('storage denied'); },
      });
    } else {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true,
        value: failure === 'absent' ? undefined : {
          getItem: () => null,
          setItem() { throw new Error('storage full'); },
        },
      });
    }
    expect(readLastSkirmishMission(catalog)).toBe('skirmish_ridge');
    expect(storeLastSkirmishMission(catalog, 'skirmish_foundry_district')).toBe(false);
  });
});
