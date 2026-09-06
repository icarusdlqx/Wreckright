import type { Catalog } from '../../schema/load';
import type { CampaignState, MechRecord } from '../../campaign/types';
import { machineDisplayName } from '../designLabel';
import { assign } from '../../campaign/roster';

/** Instance labels survive refits, sorting and sales without changing chassis names or saves. */
export function companyMachineLabel(catalog: Catalog, mech: MechRecord): string {
  return `${machineDisplayName(catalog, mech.design)} · Bay ${mech.id.replace(/^mech-/, '')}`;
}

export function occupiedSeatLabel(catalog: Catalog, state: CampaignState, mech: MechRecord): string {
  const occupant = state.pilots.find((pilot) => !pilot.dead && pilot.mechId === mech.id);
  const chassis = catalog.chassis.get(mech.design.chassisId);
  return `${companyMachineLabel(catalog, mech)} · ${chassis?.tonnage ?? '?'}t · ${occupant?.name ?? 'unassigned'}${mech.status === 'ready' ? '' : ` · ${mech.status}`}`;
}

export function assignWithReceipt(catalog: Catalog, state: CampaignState, pilotId: string, mechId: string | null): string {
  const pilot = state.pilots.find((entry) => entry.id === pilotId);
  if (pilot === undefined || pilot.dead) return 'Pilot unavailable.';
  const mech = state.mechs.find((entry) => entry.id === mechId);
  if (mechId !== null && mech === undefined) return 'Machine unavailable.';
  const displaced = state.pilots.find((entry) => entry.id !== pilotId && entry.mechId === mechId && mechId !== null);
  assign(state, pilotId, mechId);
  return `${pilot.name} ${mech === undefined ? 'is now unassigned' : `assigned to ${companyMachineLabel(catalog, mech)}`}.${displaced === undefined ? '' : ` ${displaced.name} is now unassigned; choose another machine in Crew.`}`;
}
