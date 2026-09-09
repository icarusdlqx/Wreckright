import type { Catalog } from '../../schema/load';
import { deploymentPlan } from '../../campaign/deployment';
import { writeDeploymentSeats } from '../../campaign/deploymentSeats';
import { assign } from '../../campaign/roster';
import { isMechAvailable, isPilotAvailable, type CampaignState, type DeploymentSeat } from '../../campaign/types';
import { companyMachineLabel } from './companyLabels';

export function beginPreparation(catalog: Catalog, state: CampaignState): void {
  if (state.contract === null || state.deploymentSeats != null) return;
  writeDeploymentSeats(state, deploymentPlan(catalog, state, state.contract.missionId).seats);
}

export function preparationReadiness(state: CampaignState, seat: DeploymentSeat): string {
  if (seat.mechId === null && seat.pilotId === null) return 'Empty berth';
  const pilot = state.pilots.find((entry) => entry.id === seat.pilotId);
  const mech = state.mechs.find((entry) => entry.id === seat.mechId);
  if (seat.pilotId === null) return 'Needs pilot';
  if (pilot === undefined || pilot.dead) return 'Replace pilot';
  if (!isPilotAvailable(state, pilot)) return 'Injured · misses next mission';
  if (mech === undefined) return 'Needs machine';
  if (mech.status === 'hulk') return 'Needs rebuilding';
  if (!isMechAvailable(state, mech)) return `Workshop · day ${mech.readyOnDay}`;
  if (mech.design.mounts.length === 0) return 'Needs weapon';
  if (pilot.mechId !== mech.id) return 'Confirm pilot';
  return 'Ready';
}

export function selectPreparationMech(catalog: Catalog, state: CampaignState, index: number, mechId: string): string {
  const mech = state.mechs.find((entry) => entry.id === mechId);
  if (mech === undefined) return 'Machine unavailable.';
  const seats = (state.deploymentSeats ?? []).map((seat) => ({ ...seat }));
  if (seats.some((seat, position) => position !== index && seat.mechId === mechId)) return 'That machine already has a deployment seat.';
  while (seats.length <= index) seats.push({ mechId: null, pilotId: null });
  const seat = seats[index]!;
  const previousPilot = state.pilots.find((pilot) => pilot.id === seat.pilotId);
  const occupant = state.pilots.find((pilot) => !pilot.dead && pilot.mechId === mechId);
  const pilotId = previousPilot?.dead === false ? previousPilot.id : occupant?.id ?? null;
  if (pilotId !== null) for (const other of seats) if (other.pilotId === pilotId) other.pilotId = null;
  seats[index] = { mechId, pilotId };
  writeDeploymentSeats(state, seats);
  return `${companyMachineLabel(catalog, mech)} placed in seat ${index + 1}.${pilotId === null ? ' Assign a pilot before deployment.' : ''}`;
}

export function clearPreparationSeat(state: CampaignState, index: number, pilotOnly = false): string {
  const seats = state.deploymentSeats?.map((seat) => ({ ...seat }));
  const seat = seats?.[index];
  if (seats === undefined || seat === undefined) return 'Seat already empty.';
  if (pilotOnly && seat.pilotId !== null) assign(state, seat.pilotId, null);
  seats[index] = pilotOnly ? { ...seat, pilotId: null } : { pilotId: null, mechId: null };
  writeDeploymentSeats(state, seats);
  return pilotOnly ? 'Pilot returned to reserves. The machine needs a replacement pilot.' : 'Machine and pilot held in reserve.';
}
