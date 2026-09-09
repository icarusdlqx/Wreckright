import type { Catalog } from '../schema/load';
import type { LanceEntry } from '../sim/world';
import { asPilot, assign } from './roster';
import {
  findMech,
  isMechAvailable,
  isPilotAvailable,
  type CampaignState,
  type DeploymentSeat,
  type MechRecord,
  type PilotRecord,
} from './types';

export const PLAYER_TEAM = 0;

/** Thrown when the company cannot field anything, so the UI can say so rather than crash. */
export class DeploymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeploymentError';
  }
}

export interface DeployablePair {
  mech: MechRecord;
  pilot: PilotRecord;
}

function isFieldable(state: CampaignState, mech: MechRecord): boolean {
  // A rebuilt salvage hull may legitimately be saved without weapons while it
  // waits for a refit. It is workshop-ready, not combat-ready.
  return mech.status !== 'hulk' && mech.design.mounts.length > 0 && isMechAvailable(state, mech);
}

/**
 * Everyone who can walk out of the bay, paired with what they will walk out in.
 * Pilots keep their own mech; anybody left over is seated in a spare hull.
 *
 * That second pass matters: salvaged chassis arrive with nobody assigned, and a
 * killed pilot's mech is unbound, so a company could hold fit pilots and
 * battle-ready mechs and still field nothing. This function only reads;
 * `fillEmptySeats` writes the pairing back so the barracks agrees with it.
 */
export function deployableLance(state: CampaignState): DeployablePair[] {
  const pairs: DeployablePair[] = [];
  const spoken = new Set<string>();
  const held = (id: string): boolean => state.benched.includes(id);

  for (const pilot of state.pilots) {
    if (pilot.mechId === null) continue;
    if (isPilotAvailable(state, pilot)) spoken.add(pilot.mechId);
    if (!isPilotAvailable(state, pilot) || held(pilot.id)) continue;
    const mech = findMech(state, pilot.mechId);
    if (mech === null || !isFieldable(state, mech)) continue;
    pairs.push({ mech, pilot });
  }

  for (const pilot of state.pilots) {
    if (pilot.mechId !== null || !isPilotAvailable(state, pilot) || held(pilot.id)) continue;
    const free = state.mechs.find(
      (mech) => !spoken.has(mech.id) && isFieldable(state, mech),
    );
    if (free === undefined) break;
    spoken.add(free.id);
    pairs.push({ mech: free, pilot });
  }

  return pairs;
}

/** Records the pairing `deployableLance` worked out, so the roster matches the field. */
export function fillEmptySeats(state: CampaignState): void {
  for (const pair of deployableLance(state)) {
    if (pair.pilot.mechId !== pair.mech.id) assign(state, pair.pilot.id, pair.mech.id);
  }
}

export function defaultDropBerths(catalog: Catalog): number {
  return catalog.rules.economy.deployment.normalUnitLimit;
}

export function missionSlots(catalog: Catalog, missionId: string): number {
  const mission = catalog.missions.get(missionId);
  const authored =
    mission?.lances.find((lance) => lance.team === PLAYER_TEAM)?.units.length ?? 0;
  return authored === 0 ? 0 : mission?.maxPlayerUnits ?? defaultDropBerths(catalog);
}

function tonnageOf(catalog: Catalog, design: { chassisId: string }): number {
  return catalog.chassis.get(design.chassisId)?.tonnage ?? 0;
}

/** Missing allowances inherit the weight of the authored player lance. */
export function dropTonnageFor(catalog: Catalog, missionId: string): number {
  const mission = catalog.missions.get(missionId);
  if (mission === undefined) return 0;
  if (mission.dropTonnage !== null) return mission.dropTonnage;

  const lance = mission.lances.find((entry) => entry.team === PLAYER_TEAM);
  return (lance?.units ?? []).reduce((total, unit) => {
    const design = catalog.designs.get(unit.designId);
    return total + (design === undefined ? 0 : tonnageOf(catalog, design));
  }, 0);
}

/** Berths are checked before weight so every caller fields the same lance. */
function legacyDropTeam(
  catalog: Catalog,
  state: CampaignState,
  missionId: string,
): DeployablePair[] {
  const berths = missionSlots(catalog, missionId);
  const allowance = dropTonnageFor(catalog, missionId);
  const taken: DeployablePair[] = [];
  let tons = 0;

  for (const pair of deployableLance(state)) {
    if (taken.length >= berths) break;
    const weight = tonnageOf(catalog, pair.mech.design);
    if (tons + weight > allowance) continue;
    taken.push(pair);
    tons += weight;
  }
  return taken;
}

export function deploymentCandidates(state: CampaignState): DeployablePair[] {
  return deployableLance({ ...state, benched: [] });
}

export interface DeploymentPlan {
  seats: DeploymentSeat[];
  pilotIds: string[];
  pairs: DeployablePair[];
  tonnage: number;
  allowance: number;
  slots: number;
  issues: string[];
}

/** Explicit choices remain visible when unavailable; another pilot never silently takes their place. */
export function deploymentPlan(catalog: Catalog, state: CampaignState, missionId: string): DeploymentPlan {
  if (state.deploymentSeats != null) return preparedDeploymentPlan(catalog, state, missionId, state.deploymentSeats);
  const candidates = deploymentCandidates(state);
  const pilotIds = state.deploymentSelection ?? legacyDropTeam(catalog, state, missionId).map((pair) => pair.pilot.id);
  const pairs: DeployablePair[] = [];
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const id of pilotIds) {
    const pilot = state.pilots.find((entry) => entry.id === id);
    const pair = candidates.find((entry) => entry.pilot.id === id);
    if (seen.has(id)) issues.push('A pilot cannot occupy two berths.');
    else if (pilot === undefined || pilot.dead) issues.push(`${pilot?.name ?? 'A selected pilot'} is no longer on the active roster.`);
    else if (!isPilotAvailable(state, pilot)) issues.push(`${pilot.name} is wounded. Choose a reserve.`);
    else if (pair === undefined) issues.push(`${pilot.name} needs an armed, fieldable machine.`);
    else pairs.push(pair);
    seen.add(id);
  }
  const slots = missionSlots(catalog, missionId);
  const allowance = dropTonnageFor(catalog, missionId);
  const tonnage = pairs.reduce((total, pair) => total + tonnageOf(catalog, pair.mech.design), 0);
  if (pilotIds.length === 0) issues.push('Choose at least one machine to put aboard.');
  if (pilotIds.length > slots) issues.push(`This mission permits ${slots} machine${slots === 1 ? '' : 's'}.`);
  if (tonnage > allowance) issues.push(`The selected lance is ${tonnage - allowance}t over the mission allowance.`);
  const seats = pilotIds.map((pilotId) => ({ pilotId,
    mechId: candidates.find((entry) => entry.pilot.id === pilotId)?.mech.id
      ?? state.pilots.find((pilot) => pilot.id === pilotId)?.mechId ?? null }));
  return { seats, pilotIds: [...pilotIds], pairs, tonnage, allowance, slots, issues };
}

/** Preparation describes actual cockpits, including uncrewed or damaged machines. */
function preparedDeploymentPlan(catalog: Catalog, state: CampaignState, missionId: string, seats: readonly DeploymentSeat[]): DeploymentPlan {
  const pairs: DeployablePair[] = [];
  const pilotIds = seats.flatMap((seat) => seat.pilotId === null ? [] : [seat.pilotId]);
  const issues: string[] = [];
  const pilots = new Set<string>();
  const machines = new Set<string>();
  let tonnage = 0;
  for (const [index, seat] of seats.entries()) {
    if (seat.mechId === null && seat.pilotId === null) continue;
    const mech = state.mechs.find((entry) => entry.id === seat.mechId);
    const pilot = state.pilots.find((entry) => entry.id === seat.pilotId);
    const duplicatePilot = seat.pilotId !== null && pilots.has(seat.pilotId);
    const duplicateMech = seat.mechId !== null && machines.has(seat.mechId);
    if (duplicatePilot) issues.push('A pilot cannot occupy two berths.');
    if (duplicateMech) issues.push('A machine cannot occupy two berths.');
    if (seat.pilotId !== null) pilots.add(seat.pilotId);
    if (seat.mechId !== null) machines.add(seat.mechId);
    if (mech !== undefined && !duplicateMech) tonnage += tonnageOf(catalog, mech.design);
    if (seat.pilotId === null) issues.push(`Seat ${index + 1} needs a pilot.`);
    else if (pilot === undefined || pilot.dead) issues.push(`${pilot?.name ?? 'A selected pilot'} is no longer on the active roster.`);
    else if (!isPilotAvailable(state, pilot)) issues.push(`${pilot.name} is wounded. Choose a reserve.`);
    else if (mech === undefined || !isFieldable(state, mech)) issues.push(`${pilot.name} needs an armed, fieldable machine.`);
    else if (pilot.mechId !== mech.id) issues.push(`${pilot.name}'s assignment changed. Confirm a pilot for seat ${index + 1}.`);
    else if (!duplicatePilot && !duplicateMech) pairs.push({ pilot, mech });
  }
  const slots = missionSlots(catalog, missionId);
  const allowance = dropTonnageFor(catalog, missionId);
  const occupied = seats.filter((seat) => seat.mechId !== null || seat.pilotId !== null).length;
  if (occupied === 0) issues.push('Choose at least one machine to put aboard.');
  if (occupied > slots) issues.push(`This mission permits ${slots} machine${slots === 1 ? '' : 's'}.`);
  if (tonnage > allowance) issues.push(`The selected lance is ${tonnage - allowance}t over the mission allowance.`);
  return { seats: seats.map((seat) => ({ ...seat })), pilotIds, pairs, tonnage, allowance, slots, issues };
}

export function dropTeam(catalog: Catalog, state: CampaignState, missionId: string): DeployablePair[] {
  const plan = deploymentPlan(catalog, state, missionId);
  return plan.issues.length === 0 ? plan.pairs : [];
}

export interface Deployment {
  seed: string;
  missionId: string;
  playerTeam: number;
  lance: DeployablePair[];
  entries: LanceEntry[];
}

/** Builds the battle inputs for the active contract, shared by the harness and the UI. */
export function prepareDeployment(catalog: Catalog, state: CampaignState): Deployment {
  const contract = state.contract;
  if (contract === null) throw new Error('no active contract');

  if (state.deploymentSeats == null) fillEmptySeats(state);
  const plan = deploymentPlan(catalog, state, contract.missionId);
  if ((state.deploymentSeats != null || state.deploymentSelection !== null) && plan.issues.length > 0) {
    throw new DeploymentError(plan.issues.join(' '));
  }
  const lance = dropTeam(catalog, state, contract.missionId);
  if (lance.length === 0) {
    const anyReady = deployableLance(state).length > 0;
    throw new DeploymentError(
      anyReady
        ? `Nothing the company can field fits the ${dropTonnageFor(catalog, contract.missionId)}t drop allowance for this contract.`
        : 'No mech is ready to deploy. Repair a mech, rebuild a hulk, or hire a fit reserve pilot. Wounded pilots miss the next mission.',
    );
  }

  return {
    seed: `${state.seed}:${contract.nodeId}:${state.day}`,
    missionId: contract.missionId,
    playerTeam: PLAYER_TEAM,
    lance,
    entries: lance.map(({ mech, pilot }) => ({
      design: mech.design,
      pilot: asPilot(pilot),
      damage: mech.condition,
    })),
  };
}
