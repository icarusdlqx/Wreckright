import type { Atmosphere } from '../../schema/atmosphere';
import type { Catalog } from '../../schema/load';
import type { TerrainMapData } from '../../schema/map';
import type { TerrainRules } from '../../schema/rules';

/** Only the commander's own insertion and announced objectives cross the intelligence seam. */
export interface MissionPreviewData {
  readonly missionId: string;
  readonly name: string;
  readonly tonnage: number | null;
  readonly objectives: readonly string[];
  readonly insertion: readonly { x: number; y: number }[];
  readonly sites: readonly { id: string; name: string; x: number; y: number; radius: number; optional: boolean }[];
  readonly map: TerrainMapData;
  readonly atmosphere: Atmosphere;
  readonly terrain: TerrainRules;
}

export function missionPreviewData(catalog: Catalog, missionId: string | null): MissionPreviewData | null {
  const mission = missionId === null ? undefined : catalog.missions.get(missionId);
  const map = mission === undefined ? undefined : catalog.maps.get(mission.mapId);
  if (mission === undefined || map === undefined) return null;
  const atmosphere = catalog.atmospheres.get(mission.atmosphereId ?? map.atmosphereId);
  if (atmosphere === undefined) return null;
  const publicObjectives = mission.objectives.filter((objective) => objective.team === 0);
  const publicZoneIds = new Set(publicObjectives.flatMap((objective) => objective.zoneIds));
  // Explicit projection prevents future authored intelligence from silently appearing in the survey.
  return {
    missionId: mission.id,
    name: mission.name,
    tonnage: mission.dropTonnage,
    objectives: mission.objectives.filter((objective) => objective.team === 0 && objective.required).map((objective) => objective.label),
    insertion: mission.lances.filter((lance) => lance.team === 0)
      .flatMap((lance) => lance.units.map((unit) => ({ ...unit.spawn }))),
    sites: mission.zones.filter((zone) => publicZoneIds.has(zone.id)).map((zone) => ({
      id: zone.id, name: zone.name, x: zone.x, y: zone.y, radius: zone.radius,
      optional: !publicObjectives.some((objective) => objective.required && objective.zoneIds.includes(zone.id)),
    })),
    map: {
      id: map.id, name: map.name, width: map.width, height: map.height, tileSize: map.tileSize,
      legend: { ...map.legend }, tiles: [...map.tiles],
      ...(map.elevation === undefined ? {} : { elevation: [...map.elevation] }),
      atmosphereId: map.atmosphereId,
      ...(map.propTheme === undefined ? {} : { propTheme: map.propTheme }),
      ...(map.landmarks === undefined ? {} : { landmarks: map.landmarks.map((landmark) => ({ ...landmark })) }),
    },
    atmosphere: {
      id: atmosphere.id, name: atmosphere.name, night: atmosphere.night,
      sky: atmosphere.sky, exposure: atmosphere.exposure,
      fog: { ...atmosphere.fog },
      sun: { ...atmosphere.sun, direction: { ...atmosphere.sun.direction } },
      fill: { ...atmosphere.fill, direction: { ...atmosphere.fill.direction } },
      hemisphere: { ...atmosphere.hemisphere }, terrainTint: { ...atmosphere.terrainTint },
      mechanics: { ...atmosphere.mechanics },
    },
    terrain: structuredClone(catalog.rules.terrain),
  };
}

/** A signed mission stays on the survey even when another posting is selected. */
export function previewMissionId(contract: { missionId: string } | null, selected: { missionId: string } | null): string | null {
  return contract?.missionId ?? selected?.missionId ?? null;
}
