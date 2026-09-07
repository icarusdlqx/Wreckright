import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { defaultLance, storeLance } from './lance';
import { SkirmishStorageNotice } from './SkirmishStorageNotice';
import { UnsavedSkirmishRosters } from './skirmishSession';

const previous = globalThis.localStorage;
afterEach(() => Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previous }));

describe('skirmish persistence reporting', () => {
  it('reports true only after a successful write to the requested side', () => {
    const entries = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      setItem: (key: string, value: string) => entries.set(key, value),
    } });
    const lance = defaultLance(catalog, 'skirmish_ridge');
    expect(storeLance('skirmish_ridge', lance, 1)).toBe(true);
    expect(entries.get('ironline.lance.enemy.skirmish_ridge')).toBe(JSON.stringify(lance));
    expect(entries.has('ironline.lance.skirmish_ridge')).toBe(false);
  });

  it.each(['quota', 'blocked', 'absent'] as const)('reports %s storage failure without mutating the session loadout', (failure) => {
    if (failure === 'blocked') {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    } else {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: failure === 'absent' ? undefined : {
        setItem() { throw new Error('quota exceeded'); },
      } });
    }
    const lance = defaultLance(catalog, 'skirmish_ridge');
    const snapshot = structuredClone(lance);
    expect(storeLance('skirmish_ridge', lance)).toBe(false);
    expect(lance).toEqual(snapshot);
  });

  it('keeps unsaved rosters available across route remounts and clears only the saved side', () => {
    const session = new UnsavedSkirmishRosters();
    const lance = defaultLance(catalog, 'skirmish_ridge');
    session.record('skirmish_ridge', lance, 'Your lance', false);
    session.record('enemy.skirmish_ridge', lance, 'Enemy lance', false);
    session.record('other_map', lance, 'Other map', true);
    expect(session.labels()).toEqual(['Your lance', 'Enemy lance']);
    const restored = session.lances();
    restored.skirmish_ridge![0]!.empty = true;
    expect(session.lances().skirmish_ridge![0]!.empty).toBeUndefined();
    session.record('skirmish_ridge', lance, 'Your lance', true);
    expect(Object.keys(session.lances())).toEqual(['enemy.skirmish_ridge']);
    expect(session.labels()).toEqual(['Enemy lance']);
  });

  it('names the unsaved rosters and explains the reload risk without blocking play', () => {
    const html = renderToStaticMarkup(createElement(SkirmishStorageNotice, {
      rosters: ['Your lance — Ridge Pass', 'Enemy lance — Foundry District'], revision: 1,
    }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('will be lost if you reload or close this page');
    expect(html).toContain('Your lance — Ridge Pass');
    expect(html).toContain('Enemy lance — Foundry District');
    expect(html).not.toContain('disabled');
  });
});
