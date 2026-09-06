import type { Catalog } from '../schema/load';
import type { BattleResult } from '../sim/world';
import type { CampaignState, Contract } from './types';

/** Result labels are presentation data; only authored player objectives can earn company rewards. */
export function completedPlayerObjectives(catalog: Catalog, battle: BattleResult) {
  const completed = new Set(battle.objectives.filter((objective) => objective.status === 'complete').map((objective) => objective.id));
  return catalog.missions.get(battle.missionId)?.objectives.filter((objective) => objective.team === 0 && completed.has(objective.id)) ?? [];
}

/** Shared progress belongs to this deployment, never idle reserves or a repeated capture action. */
export function awardSharedMissionXp(catalog: Catalog, state: CampaignState, contract: Contract,
  battle: BattleResult, participantCount: number): number {
  if (participantCount === 0 || battle.missionId !== contract.missionId || battle.missionStatus === 'active'
    || state.completedNodes.includes(contract.nodeId)) return 0;
  const rules = catalog.rules.economy.xp;
  const prefix = `${contract.nodeId}/objective/`;
  const claimed = new Set(state.sharedXpClaims.map((entry) => entry.key));
  let objectiveBudget = Math.max(0, rules.sharedObjectiveCap - state.sharedXpClaims
    .filter((entry) => entry.key.startsWith(prefix)).reduce((total, entry) => total + entry.xp, 0));
  let shared = 0;
  for (const objective of completedPlayerObjectives(catalog, battle)) {
    const key = `${prefix}${objective.id}`;
    if (claimed.has(key)) continue;
    const xp = Math.min(objectiveBudget, objective.required ? rules.perRequiredObjective : rules.perOptionalObjective);
    state.sharedXpClaims.push({ key, xp });
    objectiveBudget -= xp;
    shared += xp;
  }
  const winKey = `${contract.nodeId}/success`;
  if (battle.missionStatus === 'success' && !claimed.has(winKey)) {
    state.sharedXpClaims.push({ key: winKey, xp: rules.sharedMissionWin });
    shared += rules.sharedMissionWin;
  }
  return shared;
}
