import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { missionPreviewData, previewMissionId } from './missionPreviewData';

describe('public mission terrain survey', () => {
  const mission = [...catalog.missions.values()][0]!;
  it('uses the signed mission before a different selected posting', () => {
    expect(previewMissionId({ missionId: 'signed' }, { missionId: 'selected' })).toBe('signed');
    expect(previewMissionId(null, { missionId: 'selected' })).toBe('selected');
    expect(missionPreviewData(catalog, null)).toBeNull();
    expect(missionPreviewData(catalog, 'missing')).toBeNull();
  });

  it('does not change when hidden forces, zones, triggers or enemy objectives change', () => {
    const first = missionPreviewData(catalog, mission.id);
    const altered = { ...mission, lances: [], reserves: [], triggers: [], zones: [],
      objectives: [...mission.objectives, { id: 'secret-order', label: 'SECRET ENEMY ORDER', type: 'destroy_all' as const,
        team: 1, required: true, zoneIds: [], holdSeconds: 0, resourcePoints: 0 }],
    };
    const alternate = { ...catalog, missions: new Map([[mission.id, altered]]) };
    expect(missionPreviewData(alternate, mission.id)).toEqual(first);
    expect(Object.keys(first!)).toEqual(['missionId', 'name', 'tonnage', 'objectives', 'map', 'atmosphere', 'terrain']);
    expect(first?.map).not.toHaveProperty('propTheme');
  });

  it('copies terrain and lighting without retaining mutable catalog references', () => {
    const data = missionPreviewData(catalog, mission.id)!;
    const original = JSON.stringify(missionPreviewData(catalog, mission.id));
    data.map.tiles[0] = 'changed';
    data.map.legend['!'] = 'changed';
    data.atmosphere.sun.direction.distance += 1;
    expect(JSON.stringify(missionPreviewData(catalog, mission.id))).toBe(original);
  });

  it('resolves the mission atmosphere override and real map dimensions for every operation', () => {
    for (const entry of catalog.missions.values()) {
      const data = missionPreviewData(catalog, entry.id)!;
      const map = catalog.maps.get(entry.mapId)!;
      expect(data.map.tiles).toEqual(map.tiles);
      expect(data.map.elevation).toEqual(map.elevation);
      expect(data.atmosphere.id).toBe(entry.atmosphereId ?? map.atmosphereId);
      expect(data.tonnage).toBe(entry.dropTonnage);
    }
  });
});
