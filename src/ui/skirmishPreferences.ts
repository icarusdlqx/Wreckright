import type { Catalog } from '../schema/load';
import { skirmishMapChoices } from './skirmishForces';
import { STANDARD_MISSION_ID } from './trainingProgress';

const LAST_MAP_KEY = 'ironline.skirmish.lastMap';

/** A map preference must never reopen a campaign contract or the training lesson. */
export function readLastSkirmishMission(catalog: Catalog): string {
  try {
    const mapId = globalThis.localStorage?.getItem(LAST_MAP_KEY);
    return skirmishMapChoices(catalog).find((choice) => choice.id === mapId)?.missionId
      ?? STANDARD_MISSION_ID;
  } catch {
    return STANDARD_MISSION_ID;
  }
}

export function storeLastSkirmishMission(catalog: Catalog, missionId: string): boolean {
  const map = skirmishMapChoices(catalog).find((choice) => choice.missionId === missionId);
  if (map === undefined) return false;
  try {
    const storage = globalThis.localStorage;
    if (storage === undefined) return false;
    storage.setItem(LAST_MAP_KEY, map.id);
    return true;
  } catch {
    return false;
  }
}
