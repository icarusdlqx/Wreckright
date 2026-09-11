import type { Campaign, CampaignNode } from '../schema/campaign';

export interface CampaignRouteView {
  revision: number;
  nodes: CampaignNode[];
  victoryNodeId: string;
  alternateVictoryNodeIds: string[];
}

/** A saved company follows the route it started, while node IDs remain stable. */
export function campaignRouteForRevision(
  campaign: Campaign,
  revision: number,
): CampaignRouteView | null {
  if (revision === campaign.contentRevision) {
    return {
      revision,
      nodes: campaign.nodes,
      victoryNodeId: campaign.victoryNodeId,
      alternateVictoryNodeIds: campaign.alternateVictoryNodeIds,
    };
  }

  const legacy = campaign.legacyRoutes.find((route) => route.revision === revision);
  if (legacy === undefined) return null;

  const currentNodes = new Map(campaign.nodes.map((node) => [node.id, node]));
  const nodes: CampaignNode[] = [];
  for (const routeNode of legacy.nodes) {
    const current = currentNodes.get(routeNode.id);
    if (current === undefined) return null;
    nodes.push({ ...current, requires: routeNode.requires });
  }

  return {
    revision,
    nodes,
    victoryNodeId: legacy.victoryNodeId,
    alternateVictoryNodeIds: legacy.alternateVictoryNodeIds,
  };
}

export function isRouteVictory(route: CampaignRouteView, nodeId: string): boolean {
  return route.victoryNodeId === nodeId || route.alternateVictoryNodeIds.includes(nodeId);
}

export function hasCompletedRouteVictory(
  route: CampaignRouteView,
  completedNodes: readonly string[],
): boolean {
  return completedNodes.some((nodeId) => isRouteVictory(route, nodeId));
}
