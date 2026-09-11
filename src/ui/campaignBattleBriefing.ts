import type { CampaignState } from '../campaign/types';
import type { Catalog } from '../schema/load';

/** A shared tactical map must not overwrite the faction's reason for fighting there. */
export function campaignBattleBriefing(catalog: Catalog, state: CampaignState): { name: string; briefing: string } | undefined {
  const node = catalog.campaigns.get(state.campaignId)?.nodes.find((candidate) =>
    candidate.id === state.contract?.nodeId && candidate.missionId === state.contract?.missionId);
  return node === undefined ? undefined : { name: node.name, briefing: node.brief };
}
