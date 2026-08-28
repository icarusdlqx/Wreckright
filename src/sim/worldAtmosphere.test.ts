import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import type { Catalog } from '../schema/load';
import { createWorld } from './world';

describe('world atmosphere resolution', () => {
  it('prefers a mission atmosphere over the map atmosphere', () => {
    const world = createWorld(catalog, { seed: 'night-air', missionId: 'causeway_night' });

    expect(catalog.maps.get(world.mission.mapId)?.atmosphereId).toBe('cold_rime');
    expect(world.atmosphere.id).toBe('moonlit_night');
  });

  it('falls back through the map and its schema default', () => {
    const authored = createWorld(catalog, {
      seed: 'map-air',
      missionId: 'causeway_crossing',
    });
    const defaulted = createWorld(catalog, {
      seed: 'default-air',
      missionId: 'skirmish_ridge',
    });

    expect(authored.atmosphere.id).toBe('cold_rime');
    expect(defaulted.atmosphere.id).toBe('overcast_day');
    expect(defaulted.atmosphere.mechanics).toEqual({
      sightFactor: 1,
      sensorFactor: 1,
      heatDissipationFactor: 1,
      wind: { x: 0, y: 0 },
    });
  });

  it('rejects an atmosphere identifier that cannot be resolved', () => {
    const mission = structuredClone(catalog.missions.get('causeway_night'));
    if (mission === undefined) throw new Error('missing night mission');
    mission.atmosphereId = 'missing_air';
    const missions = new Map(catalog.missions).set(mission.id, mission);
    const fittedCatalog = { ...catalog, missions } satisfies Catalog;

    expect(() =>
      createWorld(fittedCatalog, { seed: 'missing-air', missionId: mission.id }),
    ).toThrow('unknown atmosphere "missing_air"');
  });
});
