import type { Campaign, CampaignNode } from '../schema/campaign';
import type { Catalog } from '../schema/load';
import { missionTickBudget } from '../schema/missionClock';
import { pruneMarket } from './market';
import { isSideContract, pruneSideOffers, sideContracts } from './sidework';
import { runBattle, type BattleResult } from '../sim/world';
import { completeRepair } from './repair';
import { applyContractFailure, recoveryNotice } from './recovery';
import { availableXp, awardXp, resolveCasualty, returnedFromField } from './roster';
import { applySalvage, resolveSalvage, type SalvageReport } from './salvage';
import { awardSharedMissionXp } from './missionProgression';
import { earnedCampaignRewards, validateRewardGrants, applyCampaignRewards } from './missionRewards';
import { recoveredHulk } from './salvagedHull';
import { negotiationOptions } from './contractTerms';
import { dailyPayroll } from './ledger';
import { employerById, recordEmployerFailure } from './employers';
import { pruneCampaignHistory } from './history';
import { fillEmptySeats, PLAYER_TEAM, prepareDeployment, type DeployablePair } from './deployment';
import { logCampaign, withCampaignRng } from './campaignState';
import { applyRestDayEvent } from './events';
import { needsCrewStandDown, recoverRestingCrew } from './crewRecovery';
import {
  findMech, findPilot, type CampaignState, type MissionOutcome, type PilotReport,
} from './types';

export { negotiationOptions } from './contractTerms';
export {
  deployableLance, DeploymentError, defaultDropBerths, dropTeam, dropTonnageFor,
  fillEmptySeats, missionSlots, PLAYER_TEAM, prepareDeployment,
} from './deployment';
export type { DeployablePair, Deployment } from './deployment';

function isVictoryNode(campaign: Campaign, nodeId: string): boolean {
  return campaign.victoryNodeId === nodeId || campaign.alternateVictoryNodeIds.includes(nodeId);
}

function completedVictory(campaign: Campaign, completedNodes: readonly string[]): boolean {
  return completedNodes.some((nodeId) => isVictoryNode(campaign, nodeId));
}

export { startCampaign } from './campaignStart';

export function campaignOf(catalog: Catalog, state: CampaignState) {
  const campaign = catalog.campaigns.get(state.campaignId);
  if (campaign === undefined) throw new Error(`unknown campaign "${state.campaignId}"`);
  return campaign;
}

/** The authored campaign only — the jobs that advance the war. */
export function campaignNodes(catalog: Catalog, state: CampaignState): CampaignNode[] {
  const campaign = campaignOf(catalog, state);
  const done = new Set(state.completedNodes);

  return campaign.nodes.filter(
    (node) =>
      !done.has(node.id) &&
      !state.failedNodes.includes(node.id) &&
      node.requires.every((required) => done.has(required)),
  );
}

/**
 * Everything signable today: the war, then whatever the hiring hall is posting.
 * Side work is what a company does when it is not ready for the next authored
 * job — before this, the calendar was the only alternative.
 */
export function availableNodes(catalog: Catalog, state: CampaignState): CampaignNode[] {
  if (state.finished) return [];
  return [...campaignNodes(catalog, state), ...sideContracts(catalog, state)];
}

export interface ActionResult {
  ok: boolean;
  reason: string | null;
}

export function acceptContract(
  catalog: Catalog,
  state: CampaignState,
  nodeId: string,
  termsId: string,
): ActionResult {
  if (state.finished) return { ok: false, reason: 'the campaign is over' };
  if (state.contract !== null) return { ok: false, reason: 'a contract is already active' };

  const node = availableNodes(catalog, state).find((entry) => entry.id === nodeId);
  if (node === undefined) return { ok: false, reason: 'that contract is not available' };

  const option = negotiationOptions(catalog, node).find((terms) => terms.id === termsId);
  if (option === undefined) return { ok: false, reason: 'invalid contract terms' };
  const employer = employerById(campaignOf(catalog, state), node.employerId);

  // A side posting is off the board the moment it is signed. The authored
  // campaign tracks completion instead, because those jobs have to stay
  // failable and their prerequisites depend on it.
  if (isSideContract(node.id)) state.sideTaken.push(node.id);

  state.contract = {
    nodeId: node.id,
    missionId: node.missionId,
    employerId: employer.id,
    employerName: employer.name,
    termsId: option.id,
    payout: option.payout,
    salvageShare: option.salvageShare,
    acceptedOnDay: state.day,
    deadlineDay: state.day + node.deadlineDays,
  };

  logCampaign(
    state,
    `Signed ${option.name.toLowerCase()} terms with ${employer.name} for ${node.name}: ` +
      `${option.payout} credits, ` +
      `${Math.round(option.salvageShare * 100)}% salvage, due day ${state.contract.deadlineDay}.`,
  );
  return { ok: true, reason: null };
}

export function abandonContract(catalog: Catalog, state: CampaignState): void {
  const contract = state.contract;
  if (contract === null) return;
  state.contract = null;
  const employerName = recordEmployerFailure(catalog, state, contract, 'withdrawn');
  const failure = applyContractFailure(catalog, state, contract);
  logCampaign(state, `Withdrew from the ${employerName} contract.${recoveryNotice(failure)}`);
  advanceDays(catalog, state, failure.recoveryDays);
}

export interface MissionRun {
  outcome: MissionOutcome;
  battle: BattleResult;
  salvage: SalvageReport;
}

export function runMission(catalog: Catalog, state: CampaignState): MissionRun {
  const deployment = prepareDeployment(catalog, state);
  const battle = runBattle(catalog, {
    seed: deployment.seed,
    missionId: deployment.missionId,
    playerTeam: deployment.playerTeam,
    playerLance: deployment.entries,
    difficulty: state.difficulty,
    maxTicks: missionTickBudget(catalog, deployment.missionId),
    // Auto-resolving a contract should play the lance properly, not park it.
    playerController: 'tactical',
  });
  return resolveMission(catalog, state, battle, deployment.lance);
}

/** Validate before spending claim IDs, changing a pilot, or touching the company account. */
function validateSettlement(state: CampaignState, battle: BattleResult, lance: readonly DeployablePair[]): void {
  if (battle.missionStatus === 'active') throw new Error('battle has not finished');
  const units = battle.units.filter((unit) => unit.team === PLAYER_TEAM);
  const pilots = new Set<string>();
  const mechs = new Set<string>();
  for (const [index, pair] of lance.entries()) {
    const unit = units[index];
    if (pilots.has(pair.pilot.id) || mechs.has(pair.mech.id)) throw new Error('duplicate deployment identity');
    pilots.add(pair.pilot.id);
    mechs.add(pair.mech.id);
    // Legacy callers used company pilot IDs; live simulation uses the template ID.
    const pilotMatches = unit?.pilotId === pair.pilot.templateId || unit?.pilotId === pair.pilot.id;
    if (findMech(state, pair.mech.id) !== pair.mech || findPilot(state, pair.pilot.id) !== pair.pilot ||
      unit === undefined || !pilotMatches || unit.designId !== pair.mech.design.id) {
      throw new Error('battle does not match the deployed company');
    }
  }
}

export function resolveMission(
  catalog: Catalog,
  state: CampaignState,
  battle: BattleResult,
  lance: DeployablePair[],
  restDayEvents = true,
): MissionRun {
  const contract = state.contract;
  if (contract === null) throw new Error('no active contract');

  if (battle.missionId !== contract.missionId) throw new Error('battle does not match the active contract');
  validateSettlement(state, battle, lance);
  const won = battle.missionStatus === 'success';
  const participants = Math.min(lance.length, battle.units.filter((unit) => unit.team === PLAYER_TEAM).length);
  const grants = earnedCampaignRewards(catalog, state, contract, battle, participants);
  validateRewardGrants(catalog, grants);
  const sharedXp = awardSharedMissionXp(catalog, state, contract, battle, participants);
  const casualties: string[] = [];
  const mechsLost: string[] = [];
  const pilotReports: PilotReport[] = [];

  // Only a resolved company deployment spends an infirmary mission. New
  // casualties are applied afterward so this battle cannot heal its own wounds.
  recoverRestingCrew(state);

  battle.units
    .filter((unit) => unit.team === PLAYER_TEAM)
    .forEach((unit, index) => {
      const pair = lance[index];
      if (pair === undefined) return;

      pair.mech.condition = unit.condition;
      // A mech that walked off the field is off the field, not lost — pulling a
      // cripple out before it dies is the whole point of ordering a withdrawal.
      if (returnedFromField(unit)) {
        pair.mech.status = 'ready';
      } else {
        pair.mech.status = 'hulk';
        pair.mech.rebuildCost = Math.round(
          (catalog.chassis.get(pair.mech.design.chassisId)?.baseCost ?? 0) *
            catalog.rules.salvage.hulkRebuildCostFraction,
        );
        mechsLost.push(pair.mech.design.name);
      }

      const xp = awardXp(catalog, { pilot: pair.pilot, unit }, won) + sharedXp;
      pair.pilot.xp += sharedXp;

      const casualty = withCampaignRng(state, (rng) =>
        resolveCasualty(catalog, rng, pair.pilot, unit, state.day),
      );

      if (casualty.died) casualties.push(`${pair.pilot.name} (killed)`);
      else if (casualty.injuredDays > 0) {
        casualties.push(`${pair.pilot.name} (misses the next mission)`);
      }

      // Banking the award leaves the commander a real training decision; the
      // old automatic spend made the barracks buttons decorative.
      pilotReports.push({
        pilotId: pair.pilot.id,
        name: pair.pilot.name,
        mech: pair.mech.design.name,
        kills: unit.kills,
        damage: Math.round(unit.damageDealt),
        xp,
        xpBanked: availableXp(pair.pilot),
        sharedXp,
        promotions: [],
        fate: casualty.died ? 'killed' : casualty.injuredDays > 0 ? 'injured' : 'returned',
      });
    });

  const salvage = won
    ? withCampaignRng(state, (rng) =>
        resolveSalvage(catalog, rng, battle, PLAYER_TEAM, contract.salvageShare),
      )
    : {
        candidates: [], chassisRecovered: [], finalized: false, hulls: [],
        offered: [], items: [], provenance: [],
      };

  const failure = won ? null : applyContractFailure(catalog, state, contract);

  if (won) {
    applySalvage(state, salvage);
    state.cbills += contract.payout;

    for (const hull of salvage.hulls) {
      const mech = recoveredHulk(catalog, hull, `mech-${state.nextId}`, state.day);
      if (mech === null) continue;
      state.mechs.push(mech);
      state.nextId += 1;
    }
    if (!isSideContract(contract.nodeId)) state.completedNodes.push(contract.nodeId);
  }

  const campaignRewards = applyCampaignRewards(catalog, state, grants);
  const outcome: MissionOutcome = {
    nodeId: contract.nodeId,
    missionId: contract.missionId,
    employerId: contract.employerId,
    employerName: contract.employerName,
    termsId: contract.termsId,
    won,
    day: state.day,
    payout: won ? contract.payout : 0,
    paymentDisputeSettled: false,
    salvagedChassis: salvage.chassisRecovered,
    salvagedItems: salvage.items,
    salvageOffered: salvage.offered,
    salvageFinalized: false,
    salvageCandidates: salvage.candidates,
    salvageProvenance: salvage.provenance,
    pilotCasualties: casualties,
    mechsLost,
    pilotReports,
    campaignRewards,
  };

  state.history.push(outcome);
  state.contract = null;

  logCampaign(
    state,
    won
      ? `Contract complete: ${contract.payout} credits, ${salvage.items.length} item(s) and ` +
          `${salvage.chassisRecovered.length} chassis salvaged.`
      : `Contract failed. No payout.${recoveryNotice(failure!)}`,
  );

  const campaign = campaignOf(catalog, state);
  if (won && isVictoryNode(campaign, contract.nodeId)) {
    state.finished = true;
    state.won = true;
    logCampaign(state, `${campaign.name} won.`);
  }

  advanceDays(catalog, state, 1 + (failure?.recoveryDays ?? 0), restDayEvents);
  return { outcome, battle, salvage };
}

export function standDownCampaign(catalog: Catalog, state: CampaignState): { ok: boolean; reason: string } {
  const contract = state.contract;
  if (contract === null) return { ok: false, reason: 'Accept a real contract to forfeit first.' };
  if (!needsCrewStandDown(catalog, state)) {
    return { ok: false, reason: 'Stand-down is reserved for an entirely wounded crew without affordable relief.' };
  }
  resolveMission(catalog, state, {
    seed: `${state.seed}:${contract.nodeId}:stand-down`, missionId: contract.missionId,
    missionStatus: 'failure', missionReason: 'objectives-failed', objectives: [],
    ticks: 0, durationSeconds: 0, winner: null, decided: true, units: [], weapons: [],
  }, [], false);
  const reason = 'Contract forfeited. No XP, payout or salvage earned; the crew has missed a mission and can return to duty.';
  logCampaign(state, reason);
  return { ok: true, reason };
}

export function advanceDays(catalog: Catalog, state: CampaignState, days: number, restDayEvents = true): void {
  let remaining = days;
  let payrollPaid = 0;

  while (remaining > 0) {
    remaining -= 1;
    state.day += 1;

    const payroll = dailyPayroll(catalog, state);
    state.cbills -= payroll;
    payrollPaid += payroll;

    for (const mech of state.mechs) {
      if (mech.status === 'repairing' && mech.readyOnDay <= state.day) {
        completeRepair(catalog, mech);
        logCampaign(state, `${mech.design.name} is out of the bay.`);
      }
    }

    if (state.contract !== null && state.day > state.contract.deadlineDay) {
      const contract = state.contract;
      state.contract = null;
      const employerName = recordEmployerFailure(catalog, state, contract, 'expired');
      const failure = applyContractFailure(catalog, state, contract);
      logCampaign(state, `The ${employerName} contract expired.${recoveryNotice(failure)}`);
      remaining += failure.recoveryDays;
    }

    if (!state.finished && restDayEvents) {
      withCampaignRng(state, (rng) => {
        applyRestDayEvent(catalog, state, rng.fork(`rest-day:${state.day}`));
      });
    }
    pruneCampaignHistory(catalog, state);
  }

  if (payrollPaid > 0) logCampaign(state, `Payroll: ${payrollPaid} credits.`);

  // Casualties and finished repairs both leave hulls without a pilot; seat them
  // now so the barracks and the deploy button agree before the player looks.
  fillEmptySeats(state);

  pruneSideOffers(catalog, state);
  pruneMarket(catalog, state);
  pruneCampaignHistory(catalog, state);

  if (state.finished) return;

  // Only the war running out ends the campaign. Side work always renews, so
  // asking whether anything at all is on offer would never be false again.
  if (campaignNodes(catalog, state).length === 0 && state.contract === null) {
    state.finished = true;
    state.won = completedVictory(campaignOf(catalog, state), state.completedNodes);
    logCampaign(state, state.won ? 'Campaign won.' : 'No contracts remain. Campaign over.');
  }
}

export { findMech, findPilot };
