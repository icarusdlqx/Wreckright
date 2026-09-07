import { useMemo, useState } from 'react';
import type { Catalog } from '../schema/load';
import { defaultLance, factionLance, loadLance, storeLance, type SkirmishBerth } from './lance';
import { TRAINING_MISSION_ID } from './trainingProgress';
import { unsavedSkirmishRosters } from './skirmishSession';
import { loadPlayerDifficulty, skirmishForceIssue, skirmishMapChoices, storePlayerDifficulty } from './skirmishForces';

export function useSkirmishForces(catalog: Catalog, missionId: string) {
  const [edits, setEdits] = useState(() => unsavedSkirmishRosters.lances());
  const [crewEdits, setCrewEdits] = useState<Record<string, string>>({});
  const [unsavedRosters, setUnsavedRosters] = useState(() => unsavedSkirmishRosters.labels());
  const [saveFailureRevision, setSaveFailureRevision] = useState(0);
  const friendly = useMemo(() => missionId === TRAINING_MISSION_ID
    ? defaultLance(catalog, missionId)
    : edits[missionId] ?? loadLance(catalog, missionId), [catalog, edits, missionId]);
  const enemy = useMemo(() => edits[`enemy.${missionId}`] ?? loadLance(catalog, missionId, 1), [catalog, edits, missionId]);
  const playerDifficulty = useMemo(() => crewEdits[missionId] ?? loadPlayerDifficulty(catalog, missionId), [catalog, crewEdits, missionId]);
  const setLance = (next: SkirmishBerth[], team = 0): void => {
    if (missionId === TRAINING_MISSION_ID) return;
    setEdits((previous) => ({ ...previous, [`${team === 0 ? '' : 'enemy.'}${missionId}`]: next }));
    const saved = storeLance(missionId, next, team);
    const key = `${team === 0 ? '' : 'enemy.'}${missionId}`;
    unsavedSkirmishRosters.record(key, next,
      `${team === 0 ? 'Your' : 'Enemy'} lance — ${catalog.missions.get(missionId)?.name ?? missionId}`, saved);
    setUnsavedRosters(unsavedSkirmishRosters.labels());
    if (!saved) setSaveFailureRevision((previous) => previous + 1);
  };
  const issue = useMemo(() => skirmishForceIssue(catalog, missionId, friendly, 'Your')
    ?? skirmishForceIssue(catalog, missionId, enemy, 'Enemy'), [catalog, enemy, friendly, missionId]);
  const friendlyKey = useMemo(() => JSON.stringify(friendly), [friendly]);
  const enemyKey = useMemo(() => JSON.stringify(enemy), [enemy]);
  const maps = useMemo(() => skirmishMapChoices(catalog), [catalog]);
  return {
    friendly, enemy, playerDifficulty, issue,
    unsavedRosters, saveFailureRevision,
    friendlyKey, enemyKey, maps,
    mapId: catalog.missions.get(missionId)?.mapId ?? '',
    setFriendly: (next: SkirmishBerth[]) => setLance(next),
    setEnemy: (next: SkirmishBerth[]) => setLance(next, 1),
    setFaction: (side: 'player' | 'enemy', faction: 'linewrought' | 'aurelian' | 'mixed') => {
      const team = side === 'player' ? 0 : 1;
      setLance(factionLance(catalog, missionId, faction, team), team);
    },
    setPlayerDifficulty: (tier: string) => {
      if (catalog.rules.difficulty.tiers[tier] === undefined) return;
      setCrewEdits((previous) => ({ ...previous, [missionId]: tier }));
      storePlayerDifficulty(missionId, tier);
    },
  };
}
