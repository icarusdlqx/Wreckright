import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { catalog } from '../../../tests/support';
import { startCampaign } from '../../campaign/campaign';
import { estimateRepair, projectedRepairWindow, startRepair } from '../../campaign/repair';
import { skillCost } from '../../campaign/roster';
import type { CampaignState, MissionOutcome } from '../../campaign/types';
import { BarracksPanel } from './BarracksPanel';
import { CampaignPostBattle } from './CampaignPostBattle';
import { CampaignWorkspace } from './CampaignWorkspace';
import { Debrief } from './Debrief';
import { DebriefActions } from './DebriefActions';
import type { CampaignNavigationTarget } from './campaignNavigation';

function report(state: CampaignState): MissionOutcome {
  const pilot = state.pilots[0]!;
  return {
    nodeId: 'militia_raid', missionId: 'training_ground', employerId: 'kestrel_combine', employerName: 'Kestrel Combine',
    termsId: 'standard', won: true, day: state.day, payout: 100, paymentDisputeSettled: false,
    salvagedChassis: [], salvagedItems: [], salvageOffered: [], salvageCandidates: [], salvageProvenance: [],
    salvageFinalized: false, pilotCasualties: [], mechsLost: [],
    pilotReports: [{ pilotId: pilot.id, name: pilot.name, mech: state.mechs[0]!.design.name,
      kills: 2, damage: 123, xp: 77, xpBanked: 77, promotions: [], fate: 'returned' }],
  };
}

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((entry: ReactNode) => elements(entry));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}

describe('company workflow', () => {
  it.each([
    { finished: false, won: false, retired: false, label: 'Available for contract' },
    { finished: true, won: true, retired: false, label: 'Campaign complete' },
    { finished: true, won: false, retired: false, label: 'Campaign over' },
    { finished: true, won: false, retired: true, label: 'Company retired' },
  ])('labels the company status as $label', ({ finished, won, retired, label }) => {
    const state = startCampaign(catalog, 'border_dispute', 'workspace-status');
    state.finished = finished;
    state.won = won;
    if (retired) state.log.unshift({ day: state.day, text: 'The company retired. No fieldable recovery remained.' });
    const html = renderToStaticMarkup(createElement(CampaignWorkspace, {
      catalog, state, fullCompany: true, operations: null, workshop: null, crew: null, supplies: null,
    }));
    expect(html).toContain(label);
    expect(html.includes('company-workspace--finished')).toBe(finished);
    if (finished) {
      expect(html).not.toContain('Available for contract');
      expect(html).not.toContain('drop berths');
      expect(html).not.toContain('data-testid="camp-area-workshop"');
    }
  });

  it('keeps compact crew rows and shows details for the requested living pilot', () => {
    const state = startCampaign(catalog, 'border_dispute', 'crew-view');
    const selected = state.pilots[2]!;
    selected.xp += skillCost(catalog, selected.gunnery);
    const before = JSON.stringify(state);
    const html = renderToStaticMarkup(createElement(BarracksPanel, {
      state, mutate: vi.fn(), focus: { area: 'crew', pilotId: selected.id },
    }));
    expect([...html.matchAll(/data-testid="camp-pilot-detail-[^"]+"/g)]).toHaveLength(1);
    expect(html).toContain(`data-testid="camp-pilot-detail-${selected.id}"`);
    expect(html).toContain(`data-testid="camp-seat-${selected.id}"`);
    expect(html).toContain('Ready to train');
    for (const filter of ['all', 'available', 'wounded', 'training']) expect(html).toContain(`data-testid="crew-filter-${filter}"`);
    expect(html.indexOf('data-testid="crew-hiring-tab"')).toBeLessThan(html.indexOf('data-testid="camp-pilot-'));
    expect(JSON.stringify(state)).toBe(before);
  });

  it('keeps a pilot’s last deployment report when the company fights without them', () => {
    const state = startCampaign(catalog, 'border_dispute', 'last-pilot-report');
    const previous = report(state);
    state.history = [previous, { ...report(state), pilotReports: [] }];
    const html = renderToStaticMarkup(createElement(BarracksPanel, { state, mutate: vi.fn() }));
    expect(html).toContain('Last mission: +77 XP · 2 kills · 123 damage');
  });

  it('makes hiring independently reachable, including when no living crew remain', () => {
    const state = startCampaign(catalog, 'border_dispute', 'crew-hiring');
    state.pilots.forEach((pilot) => { pilot.dead = true; pilot.mechId = null; });
    const html = renderToStaticMarkup(createElement(BarracksPanel, { state, mutate: vi.fn(), focus: { area: 'crew', hiring: true } }));
    expect(html).toMatch(/<div data-testid="crew-hiring-panel">/);
    expect(html).toContain('data-testid="camp-sign-');
    expect(html).not.toContain('data-testid="camp-seat-');
  });

  it('quotes individual workshop costs and links to records without spending or booking', () => {
    const state = startCampaign(catalog, 'border_dispute', 'debrief-next');
    const [damaged, booked] = state.mechs;
    damaged!.condition.centre_torso.armour -= 2;
    booked!.condition.centre_torso.armour -= 1;
    expect(startRepair(catalog, state, booked!).ok).toBe(true);
    state.pilots[0]!.xp += skillCost(catalog, state.pilots[0]!.gunnery);
    state.pilots[1]!.recoveryMissions = 1;
    const outcome = report(state);
    outcome.campaignRewards = [{ id: 'contract/part', label: 'Workshop part',
      items: [{ kind: 'weapon', itemId: 'medium_laser', count: 1 }], hulls: [],
      freeRepairDays: 0, supplierDiscountThroughDay: null, afterword: '' }];
    const before = JSON.stringify(state);
    const destinations: CampaignNavigationTarget[] = [];
    const content = DebriefActions({ catalog, state, outcome, onAction: (target) => destinations.push(target) });
    const html = renderToStaticMarkup(content);
    const quote = estimateRepair(catalog, damaged!);
    expect(html).toContain(`${quote.cost.toLocaleString('en-GB')} C repair estimate`);
    expect(html).toContain(`ready day ${projectedRepairWindow(catalog, state, quote.days).readyOnDay}`);
    expect(html).toContain('Already booked and paid');
    expect(html).toContain('No salvage came home');
    expect(html).toContain('Plus 1 part delivered as guaranteed contract rewards.');
    expect(html).not.toContain('Plus 1 parts');
    for (const button of elements(content).filter((element) => element.type === 'button')) {
      (button.props.onClick as () => void)();
    }
    expect(destinations).toContainEqual({ area: 'workshop', mechId: damaged!.id });
    expect(destinations).toContainEqual({ area: 'crew', pilotId: state.pilots[0]!.id });
    expect(destinations).toContainEqual({ area: 'crew', pilotId: state.pilots[1]!.id });
    expect(destinations).toContainEqual({ area: 'crew', hiring: true });
    expect(destinations).toContainEqual({ area: 'supplies' });
    expect(JSON.stringify(state)).toBe(before);
  });

  it('finalizes the chosen haul before following a debrief action, without another campaign mutation', () => {
    const state = startCampaign(catalog, 'border_dispute', 'debrief-navigation');
    state.history.push(report(state));
    const before = structuredClone(state);
    const order: string[] = [];
    const content = CampaignPostBattle({ catalog, state, status: null, outcomeCount: 1, debriefed: 0,
      mutate: (change) => { change(state); order.push('finalized'); },
      onDebriefed: () => order.push('closed'),
      onNavigate: () => { expect(state.history[0]!.salvageFinalized).toBe(true); order.push('navigated'); },
    });
    const debrief = elements(content).find((element) => element.type === Debrief)!;
    (debrief.props.onAction as (target: CampaignNavigationTarget) => void)({ area: 'crew', hiring: true });
    expect(order).toEqual(['finalized', 'closed', 'navigated']);
    before.history[0]!.salvageFinalized = true;
    expect(state).toEqual(before);
  });
});
