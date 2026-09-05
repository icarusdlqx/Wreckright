import type { Atmosphere } from '../../schema/atmosphere';
import type { Catalog } from '../../schema/load';
import type { TerrainMapData } from '../../schema/map';
import type { TerrainRules } from '../../schema/rules';

/** A survey, not battlefield state. No deployments, zones, triggers or props cross this seam. */
export interface MissionPreviewData {
  readonly missionId: string;
  readonly name: string;
  readonly tonnage: number | null;
  readonly objectives: readonly string[];
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
  // Explicit projection prevents future authored intelligence from silently appearing in the survey.
  return {
    missionId: mission.id,
    name: mission.name,
    tonnage: mission.dropTonnage,
    objectives: mission.objectives.filter((objective) => objective.team === 0 && objective.required).map((objective) => objective.label),
    map: {
      id: map.id, name: map.name, width: map.width, height: map.height, tileSize: map.tileSize,
      legend: { ...map.legend }, tiles: [...map.tiles],
      ...(map.elevation === undefined ? {} : { elevation: [...map.elevation] }),
      atmosphereId: map.atmosphereId,
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
