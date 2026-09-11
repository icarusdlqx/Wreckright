import type { Catalog } from '../schema/load';
import type { CampaignState } from './types';

/** Old completion flags alone cannot reveal an ending before its decisive contract was won. */
export function campaignEpilogue(catalog: Catalog, state: CampaignState) {
  if (!state.finished || !state.won) return null;
  const campaign = catalog.campaigns.get(state.campaignId);
  if (campaign === undefined) return null;
  const endings = new Set([campaign.victoryNodeId, ...campaign.alternateVictoryNodeIds]);
  const latestVictory = [...state.history].reverse().find((outcome) => outcome.won && endings.has(outcome.nodeId));
  const nodeId = latestVictory?.nodeId ?? state.completedNodes.find((id) => endings.has(id));
  if (nodeId === undefined || !state.completedNodes.includes(nodeId)) return null;
  const node = campaign.nodes.find((entry) => entry.id === nodeId);
  if (node === undefined) return null;
  return {
    nodeId,
    title: node.ending?.title ?? `${campaign.name} — campaign complete`,
    body: node.ending?.body ?? ['The final contract is complete. The company carries its machines, its experience and the names of the fallen into what comes next.'],
    survivors: state.pilots.filter((pilot) => !pilot.dead),
    fallen: state.pilots.filter((pilot) => pilot.dead),
    machines: state.mechs.filter((mech) => mech.status !== 'hulk'),
    hulls: state.mechs.filter((mech) => mech.status === 'hulk'),
    rewards: state.claimedRewardIds.length,
  };
}
