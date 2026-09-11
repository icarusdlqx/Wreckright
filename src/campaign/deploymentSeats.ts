import { assign } from './roster';
import type { CampaignState, DeploymentSeat } from './types';

/** Apply the reviewed pairing as one transaction; intermediate displacement is never a new choice. */
export function writeDeploymentSeats(state: CampaignState, seats: readonly DeploymentSeat[]): void {
  state.deploymentSeats = null;
  const next = seats.map((seat) => ({ ...seat }));
  for (const seat of next) {
    // Keep missing hulls visible in the saved plan without restoring a stale roster assignment.
    const knownMech = seat.mechId === null || state.mechs.some((mech) => mech.id === seat.mechId);
    if (seat.pilotId !== null && knownMech) assign(state, seat.pilotId, seat.mechId);
  }
  state.deploymentSeats = next;
  state.deploymentSelection = next.flatMap((seat) => seat.pilotId === null ? [] : [seat.pilotId]);
  state.benched = state.pilots.filter((pilot) => !state.deploymentSelection?.includes(pilot.id)).map((pilot) => pilot.id);
}

/** A pilot moves between cockpits; neither the old machine nor its empty seat disappears. */
export function putPilotInSeat(state: CampaignState, index: number, pilotId: string | null): string {
  const seats = state.deploymentSeats?.map((seat) => ({ ...seat }));
  const seat = seats?.[index];
  if (seats === undefined || seat === undefined) return 'Choose a deployment seat first.';
  const pilot = state.pilots.find((entry) => entry.id === pilotId);
  if (pilotId !== null && (pilot === undefined || pilot.dead)) return 'Pilot unavailable.';
  const previous = state.pilots.find((entry) => entry.id === seat.pilotId);
  if (previous !== undefined && previous.id !== pilotId && previous.mechId === seat.mechId) assign(state, previous.id, null);
  for (const entry of seats) if (pilotId !== null && entry.pilotId === pilotId) entry.pilotId = null;
  seat.pilotId = pilotId;
  writeDeploymentSeats(state, seats);
  return pilot === undefined ? 'Cockpit cleared. Choose a replacement pilot before deployment.'
    : `${pilot.name} assigned to seat ${index + 1}.${previous !== undefined && previous.id !== pilotId ? ` ${previous.name} returns to reserves.` : ''}`;
}
