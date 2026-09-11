import type { Catalog } from '../schema/load';
import { availableHires, hireCost } from './roster';
import { logCampaign } from './campaignState';
import type { CampaignState } from './types';

/** A wound hold is spent by a resolved or explicitly forfeited campaign mission. */
export function recoverRestingCrew(state: CampaignState): void {
  for (const pilot of state.pilots) {
    if (pilot.dead || (pilot.recoveryMissions ?? 0) <= 0) continue;
    pilot.recoveryMissions = (pilot.recoveryMissions ?? 0) - 1;
    if (pilot.recoveryMissions === 0) {
      pilot.injuredUntilDay = state.day;
      logCampaign(state, `${pilot.name} returns from the infirmary.`);
    }
  }
}

/** No calendar shortcut: only companies without fit or affordable relief crew qualify. */
export function needsCrewStandDown(catalog: Catalog, state: CampaignState): boolean {
  if (state.finished) return false;
  const living = state.pilots.filter((pilot) => !pilot.dead);
  return living.length > 0 && living.every((pilot) => (pilot.recoveryMissions ?? 0) > 0) &&
    !availableHires(catalog, state).some((pilot) => hireCost(catalog, pilot) <= state.cbills);
}

export function standDownCost(catalog: Catalog, state: CampaignState): { fee: number; days: number } | null {
  const contract = state.contract;
  if (contract === null) return null;
  const authored = catalog.campaigns.get(state.campaignId)?.nodes.some((node) => node.id === contract.nodeId);
  const rules = catalog.rules.economy.contractFailure;
  return {
    fee: authored ? Math.round(contract.payout * rules.recoveryCostFactor) : 0,
    days: 1 + (authored ? rules.recoveryDays : 0),
  };
}
