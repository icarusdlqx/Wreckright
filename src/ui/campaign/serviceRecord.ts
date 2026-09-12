import { weaponLayoutIdentity } from '../../campaign/pilotContinuity';
import type { CampaignState, MechRecord, MissionOutcome } from '../../campaign/types';
import type { Catalog } from '../../schema/load';
import { stripSerialDesignation } from '../designLabel';

export interface MachineServiceHistory {
  deployments: number;
  incomplete: boolean;
  last: { mission: string; pilot: string; machine: string; won: boolean; weaponsChanged: boolean } | null;
  acquisition: { mission: string; label: string } | null;
}

/** Owned hull IDs survive refits and renames; names and design IDs are not identities. */
export function machineServiceHistory(catalog: Catalog, state: CampaignState, mech: MechRecord): MachineServiceHistory {
  const missionName = (outcome: MissionOutcome): string => catalog.campaigns.get(state.campaignId)?.nodes
    .find((node) => node.id === outcome.nodeId)?.name ?? catalog.missions.get(outcome.missionId)?.name ?? 'Earlier contract';
  const deployments = state.history.flatMap((outcome) => {
    const report = outcome.pilotReports.find((entry) => entry.mechId === mech.id);
    return report === undefined ? [] : [{ outcome, report }];
  });
  const latest = deployments.at(-1);
  const acquisition = state.history.flatMap((outcome) => (outcome.campaignRewards ?? [])
    .filter((reward) => reward.hulls.some((hull) => hull.mechId === mech.id))
    .map((reward) => ({ mission: missionName(outcome), label: reward.label })))[0] ?? null;
  return {
    deployments: deployments.length,
    incomplete: state.historyArchive.outcomes > 0
      || state.history.some((outcome) => outcome.pilotReports.some((report) => report.mechId === undefined)),
    last: latest === undefined ? null : {
      mission: missionName(latest.outcome), pilot: latest.report.name,
      machine: stripSerialDesignation(latest.report.mech), won: latest.outcome.won,
      weaponsChanged: latest.report.weaponLayout !== undefined
        && latest.report.weaponLayout !== weaponLayoutIdentity(mech.design),
    },
    acquisition,
  };
}
