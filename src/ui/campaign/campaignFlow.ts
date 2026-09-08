import { availableNodes, advanceDays } from '../../campaign/campaign';
import { dailyPayroll, payrollThrough } from '../../campaign/ledger';
import type { CampaignState } from '../../campaign/types';
import type { Campaign, CampaignNode } from '../../schema/campaign';
import type { Catalog } from '../../schema/load';

/** Follow the actual prerequisites of every ending, without choosing an ending for the player. */
export function mainStoryNodeIds(campaign: Campaign): Set<string> {
  const ids = new Set<string>();
  const visit = (id: string): void => {
    if (ids.has(id)) return;
    ids.add(id);
    campaign.nodes.find((node) => node.id === id)?.requires.forEach(visit);
  };
  [campaign.victoryNodeId, ...campaign.alternateVictoryNodeIds].forEach(visit);
  return ids;
}

export function nextCampaignNode(catalog: Catalog, state: CampaignState): CampaignNode | null {
  if (state.finished || state.contract !== null) return null;
  const campaign = catalog.campaigns.get(state.campaignId);
  if (campaign === undefined) return null;
  const story = mainStoryNodeIds(campaign);
  const open = availableNodes(catalog, state);
  return open.find((node) => story.has(node.id)) ?? open[0] ?? null;
}

export function missingPrerequisites(campaign: Campaign, node: CampaignNode, completed: readonly string[]): string[] {
  return node.requires.filter((id) => !completed.includes(id))
    .map((id) => campaign.nodes.find((entry) => entry.id === id)?.name ?? id);
}

export interface CompanyWait {
  targetDay: number;
  days: number;
  wages: number;
  blocked: string | null;
}

/** Calendar controls expose their cost separately from free contract navigation. */
export function companyWait(catalog: Catalog, state: CampaignState, targetDay: number): CompanyWait {
  const days = Math.max(0, Math.ceil(targetDay - state.day));
  const wages = payrollThrough(catalog, state, days);
  const blocked = state.finished ? 'This campaign is over.'
    : days === 0 ? 'No waiting is needed.'
      : state.contract !== null && targetDay > state.contract.deadlineDay
        ? `The signed contract is due on day ${state.contract.deadlineDay}. Deploy or withdraw before waiting past it.`
        : wages > state.cbills ? 'The treasury cannot cover wages for this wait.' : null;
  return { targetDay, days, wages, blocked };
}

export function nextRepairWait(catalog: Catalog, state: CampaignState): CompanyWait | null {
  const days = state.mechs.filter((mech) => mech.status === 'repairing' && mech.readyOnDay > state.day)
    .map((mech) => mech.readyOnDay);
  return days.length === 0 ? null : companyWait(catalog, state, Math.min(...days));
}

/** A rest-day event may change the books; recheck payroll and deadlines at every boundary. */
export function waitCompany(catalog: Catalog, state: CampaignState, targetDay: number): string {
  const quote = companyWait(catalog, state, targetDay);
  if (quote.blocked !== null) return quote.blocked;
  const start = state.day;
  while (state.day < quote.targetDay && !state.finished) {
    const next = companyWait(catalog, state, state.day + 1);
    if (next.blocked !== null || state.cbills < dailyPayroll(catalog, state)) {
      return `Waiting stopped on day ${state.day}. ${next.blocked ?? 'Wages are no longer affordable.'}`;
    }
    advanceDays(catalog, state, 1);
  }
  return `Waited ${state.day - start} day${state.day - start === 1 ? '' : 's'}. Review the workshop, then prepare your next mission.`;
}
