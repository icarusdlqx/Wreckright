import type { Catalog } from '../schema/load';
import { validateDesign } from '../schema/designValidation';
import { dropTonnageFor } from '../campaign/campaign';
import { berthDesign, defaultLance, lanceTonnage, type SkirmishBerth } from './lance';

export interface SkirmishMapChoice { id: string; name: string; missionId: string }

export function skirmishMapChoices(catalog: Catalog): SkirmishMapChoice[] {
  return [...catalog.maps.values()].map((map) => ({
    id: map.id,
    name: map.name,
    missionId: [...catalog.missions.values()].find((mission) =>
      mission.mapId === map.id && mission.id.startsWith('skirmish_'))?.id ?? '',
  })).filter((map) => map.missionId !== '');
}

export function skirmishEnemyAllowance(catalog: Catalog, missionId: string): number {
  const player = dropTonnageFor(catalog, missionId);
  return missionId.startsWith('skirmish_') ? player
    : Math.max(player, lanceTonnage(catalog, defaultLance(catalog, missionId, 1)));
}

export function skirmishForceIssue(
  catalog: Catalog,
  missionId: string,
  berths: readonly SkirmishBerth[],
  side: 'Your' | 'Enemy',
): string | null {
  const active = berths.filter((berth) => berth.empty !== true);
  if (active.length === 0) return `${side} lance needs at least one mech.`;
  if (new Set(active.map((berth) => berth.pilotId)).size !== active.length) {
    return `${side} lance assigns the same pilot to more than one mech.`;
  }
  for (const berth of active) {
    const design = berthDesign(catalog, berth);
    if (design === null || !catalog.pilots.has(berth.pilotId)) {
      return `${side} lance contains a missing mech or pilot. Select another loadout.`;
    }
    if (!validateDesign(catalog, design).valid) {
      return `${side} lance has an invalid loadout. Open Refit loadout to correct it.`;
    }
  }
  const total = lanceTonnage(catalog, berths);
  const allowance = side === 'Enemy' ? skirmishEnemyAllowance(catalog, missionId) : dropTonnageFor(catalog, missionId);
  return total > allowance ? `${side} lance is ${total - allowance}t over the ${allowance}t limit.` : null;
}

const CREW_KEY = 'ironline.skirmish.playerDifficulty.';
export function loadPlayerDifficulty(catalog: Catalog, missionId: string): string {
  try {
    const tier = globalThis.localStorage?.getItem(`${CREW_KEY}${missionId}`);
    if (tier !== undefined && tier !== null && catalog.rules.difficulty.tiers[tier] !== undefined) return tier;
  } catch { /* The current session remains usable when storage is unavailable. */ }
  return catalog.rules.difficulty.default;
}

export function storePlayerDifficulty(missionId: string, tier: string): void {
  try { globalThis.localStorage?.setItem(`${CREW_KEY}${missionId}`, tier); }
  catch { /* The current session remains usable when storage is unavailable. */ }
}
