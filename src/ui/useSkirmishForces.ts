import { useMemo, useState } from 'react';
import type { Catalog } from '../schema/load';
import { defaultLance, factionLance, loadLanceSelection, storeLance, type SkirmishBerth, type SkirmishFaction } from './lance';
import { TRAINING_MISSION_ID } from './trainingProgress';
import { unsavedSkirmishRosters } from './skirmishSession';
import { loadPlayerDifficulty, skirmishForceIssue, skirmishMapChoices, storePlayerDifficulty } from './skirmishForces';

export function useSkirmishForces(catalog: Catalog, missionId: string) {
  const [edits, setEdits] = useState(() => unsavedSkirmishRosters.lances());
  const [factionEdits, setFactionEdits] = useState(() => unsavedSkirmishRosters.factions());
  const [crewEdits, setCrewEdits] = useState<Record<string, string>>({});
  const [unsavedRosters, setUnsavedRosters] = useState(() => unsavedSkirmishRosters.labels());
  const [saveFailureRevision, setSaveFailureRevision] = useState(0);
  const storedFriendly = useMemo(() => loadLanceSelection(catalog, missionId), [catalog, missionId]);
  const storedEnemy = useMemo(() => loadLanceSelection(catalog, missionId, 1), [catalog, missionId]);
  const friendly = useMemo(() => missionId === TRAINING_MISSION_ID
    ? defaultLance(catalog, missionId) : edits[missionId] ?? storedFriendly.lance, [catalog, edits, missionId, storedFriendly]);
  const enemy = useMemo(() => missionId === TRAINING_MISSION_ID
    ? defaultLance(catalog, missionId, 1) : edits[`enemy.${missionId}`] ?? storedEnemy.lance, [catalog, edits, missionId, storedEnemy]);
  const friendlyFaction = factionEdits[missionId] ?? storedFriendly.faction;
  const enemyFaction = factionEdits[`enemy.${missionId}`] ?? storedEnemy.faction;
  const playerDifficulty = useMemo(() => crewEdits[missionId] ?? loadPlayerDifficulty(catalog, missionId), [catalog, crewEdits, missionId]);
  const setLance = (next: SkirmishBerth[], team = 0, faction: SkirmishFaction = team === 0 ? friendlyFaction : enemyFaction): void => {
    if (missionId === TRAINING_MISSION_ID) return;
    const key = `${team === 0 ? '' : 'enemy.'}${missionId}`;
    setEdits((previous) => ({ ...previous, [key]: next }));
    setFactionEdits((previous) => ({ ...previous, [key]: faction }));
    const saved = storeLance(missionId, next, team, faction);
    unsavedSkirmishRosters.record(key, next,
      `${team === 0 ? 'Your' : 'Enemy'} lance — ${catalog.missions.get(missionId)?.name ?? missionId}`, saved, faction);
    setUnsavedRosters(unsavedSkirmishRosters.labels());
    if (!saved) setSaveFailureRevision((previous) => previous + 1);
  };
  const issue = useMemo(() => skirmishForceIssue(catalog, missionId, friendly, 'Your', friendlyFaction)
    ?? skirmishForceIssue(catalog, missionId, enemy, 'Enemy', enemyFaction), [catalog, enemy, enemyFaction, friendly, friendlyFaction, missionId]);
  const friendlyKey = useMemo(() => JSON.stringify(friendly), [friendly]);
  const enemyKey = useMemo(() => JSON.stringify(enemy), [enemy]);
  const maps = useMemo(() => skirmishMapChoices(catalog), [catalog]);
  return {
    friendly, enemy, friendlyFaction, enemyFaction, playerDifficulty, issue,
    unsavedRosters, saveFailureRevision,
    friendlyKey, enemyKey, maps,
    mapId: catalog.missions.get(missionId)?.mapId ?? '',
    setFriendly: (next: SkirmishBerth[]) => setLance(next),
    setEnemy: (next: SkirmishBerth[]) => setLance(next, 1),
    setFaction: (side: 'player' | 'enemy', faction: 'linewrought' | 'aurelian' | 'mixed') => {
      const team = side === 'player' ? 0 : 1;
      setLance(factionLance(catalog, missionId, faction, team), team, faction);
    },
    setPlayerDifficulty: (tier: string) => {
      if (catalog.rules.difficulty.tiers[tier] === undefined) return;
      setCrewEdits((previous) => ({ ...previous, [missionId]: tier }));
      storePlayerDifficulty(missionId, tier);
    },
  };
}
