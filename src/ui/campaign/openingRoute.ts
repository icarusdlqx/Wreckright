import openingRoutesData from '../../data/opening_routes.json';
import type { CampaignState } from '../../campaign/types';
import type { CampaignNode } from '../../schema/campaign';
import type { Catalog } from '../../schema/load';
import { OpeningRoutesSchema, type OpeningRoute, type OpeningRouteStep } from '../../schema/openingRoute';
import { visibleCampaignLore } from './campaignLore';

export const OPENING_ROUTES = OpeningRoutesSchema.parse(openingRoutesData);

export interface OpeningRecommendation {
  route: OpeningRoute;
  step: OpeningRouteStep;
  node: CampaignNode;
  stepNumber: number;
  links: OpeningRouteStep['links'];
}

type OpeningCompany = Pick<CampaignState, 'campaignId' | 'completedNodes' | 'finished' | 'contract'>;

/** A suggestion follows completed work; it never changes the campaign route or selected contract. */
export function openingRecommendation(
  catalog: Catalog,
  state: OpeningCompany,
  available: readonly CampaignNode[],
): OpeningRecommendation | null {
  if (state.finished || state.contract !== null) return null;
  const route = OPENING_ROUTES.find((entry) => entry.campaignId === state.campaignId);
  const campaign = catalog.campaigns.get(state.campaignId);
  if (route === undefined || campaign === undefined) return null;
  const completed = new Set(state.completedNodes);
  const openingIds = new Set(route.steps.map((step) => step.nodeId));
  // Optional surveys do not abandon the opening. Later main-route milestones
  // still prevent an established or legacy company being sent backwards.
  const beyondOpening = new Set([route.steps.at(-1)!.nodeId]);
  let previousSize = 0;
  while (previousSize !== beyondOpening.size) {
    previousSize = beyondOpening.size;
    for (const node of campaign.nodes) {
      if (node.requires.some((id) => beyondOpening.has(id))) beyondOpening.add(node.id);
    }
  }
  if (campaign.nodes.some((node) => completed.has(node.id) && !openingIds.has(node.id) && beyondOpening.has(node.id))) return null;
  const index = route.steps.findIndex((step) => !completed.has(step.nodeId));
  const step = route.steps[index];
  if (step === undefined) return null;
  const node = available.find((entry) => entry.id === step.nodeId);
  if (node === undefined || !node.requires.every((id) => completed.has(id))) return null;
  const knownLore = new Set(visibleCampaignLore([...catalog.lore.values()], state.completedNodes, state.campaignId)
    .map((entry) => entry.id));
  const links = step.links.filter((link) => link.kind === 'story'
    ? knownLore.has(link.id) : catalog.chassis.has(link.id));
  return { route, step, node, stepNumber: index + 1, links };
}
