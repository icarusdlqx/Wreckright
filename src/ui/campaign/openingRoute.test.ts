import { describe, expect, it } from 'vitest';
import { acceptContract, availableNodes, startCampaign } from '../../campaign/campaign';
import type { CampaignState } from '../../campaign/types';
import { catalog } from '../../../tests/support';
import { visibleCampaignLore } from './campaignLore';
import { OPENING_ROUTES, openingRecommendation } from './openingRoute';

function company(campaignId = 'border_dispute', completedNodes: string[] = []): CampaignState {
  return { ...startCampaign(catalog, campaignId, 'opening-route'), completedNodes };
}
const suggest = (state: CampaignState) => openingRecommendation(catalog, state, availableNodes(catalog, state));

describe('suggested opening routes', () => {
  it.each([
    ['border_dispute', ['militia_raid', 'recovery_window', 'workshop_defence']],
    ['aurelian_recall', ['first_warrant', 'cutbank_attestation', 'sarn_inventory']],
  ])('follows completed contracts in %s without requiring the side route', (campaignId, steps) => {
    for (const [index, id] of steps.entries()) {
      const state = company(campaignId, steps.slice(0, index));
      const before = structuredClone(state);
      const next = suggest(state);
      expect(next?.node.id).toBe(id);
      expect(next?.stepNumber).toBe(index + 1);
      expect(state).toEqual(before);
    }
    expect(suggest(company(campaignId, steps))).toBeNull();
  });

  it('retains optional surveys alongside the suggested main route', () => {
    const line = company('border_dispute', ['militia_raid']);
    const stock = company('aurelian_recall', ['first_warrant']);
    expect(availableNodes(catalog, line).map((node) => node.id)).toContain('recovery_window');
    expect(availableNodes(catalog, stock).map((node) => node.id)).toContain('cutbank_attestation');
    expect(availableNodes(catalog, line).map((node) => node.id)).toContain('marker_survey');
    expect(suggest(line)?.node.id).toBe('recovery_window');
    expect(availableNodes(catalog, stock).map((node) => node.id)).toContain('custody_survey');
    expect(suggest(stock)?.node.id).toBe('cutbank_attestation');
  });

  it('continues the main opening after an optional survey', () => {
    expect(suggest(company('border_dispute', ['militia_raid', 'marker_survey']))?.node.id).toBe('recovery_window');
    expect(suggest(company('aurelian_recall', ['first_warrant', 'custody_survey', 'custody_resupply']))?.node.id).toBe('cutbank_attestation');
  });

  it('uses durable completed nodes when reports have been archived and does not advance on a defeat', () => {
    const state = company('border_dispute', ['militia_raid']);
    state.historyArchive = { outcomes: 30, employers: { halloran_freight: {
      employerName: 'Halloran Freight', completed: 1, failed: 29, paid: 850000,
    } } };
    expect(suggest(state)?.node.id).toBe('recovery_window');
    state.completedNodes = [];
    expect(suggest(state)?.node.id).toBe('militia_raid');
  });

  it('leaves an active contract alone even if a different route would be suggested', () => {
    const state = company('border_dispute', ['militia_raid']);
    expect(acceptContract(catalog, state, 'recovery_window', 'standard').ok).toBe(true);
    const before = structuredClone(state);
    expect(suggest(state)).toBeNull();
    expect(state).toEqual(before);
  });

  it.each([
    ['border_dispute', ['militia_raid', 'pass_skirmish']],
    ['aurelian_recall', ['first_warrant', 'root_exchange']],
  ])('does not send an established %s company back to its opening', (id, completed) => {
    expect(suggest(company(id, completed))).toBeNull();
  });

  it('hides finished, unavailable and unknown routes without skipping ahead', () => {
    const state = company('border_dispute', ['militia_raid']);
    const available = availableNodes(catalog, state);
    expect(openingRecommendation(catalog, state, available.filter((node) => node.id !== 'recovery_window'))).toBeNull();
    state.failedNodes.push('recovery_window');
    expect(suggest(state)).toBeNull();
    state.finished = true;
    expect(openingRecommendation(catalog, state, available)).toBeNull();
    state.finished = false;
    state.campaignId = 'unknown_campaign';
    expect(openingRecommendation(catalog, state, available)).toBeNull();
  });

  it('does not reveal an unavailable prerequisite even if a caller supplies a later node', () => {
    const state = company();
    const later = catalog.campaigns.get(state.campaignId)?.nodes.find((node) => node.id === 'recovery_window');
    expect(later).toBeDefined();
    expect(openingRecommendation(catalog, state, later ? [later] : [])).toBeNull();
  });

  it('links to real, spoiler-appropriate records at the point each step is offered', () => {
    for (const route of OPENING_ROUTES) {
      const campaign = catalog.campaigns.get(route.campaignId);
      expect(campaign).toBeDefined();
      const completed: string[] = [];
      for (const step of route.steps) {
        const node = campaign?.nodes.find((entry) => entry.id === step.nodeId);
        expect(node).toBeDefined();
        expect(node?.requires.every((id) => completed.includes(id))).toBe(true);
        const known = visibleCampaignLore([...catalog.lore.values()], completed, route.campaignId);
        for (const link of step.links) {
          if (link.kind === 'story') expect(known.some((entry) => entry.id === link.id)).toBe(true);
          else expect(catalog.chassis.has(link.id)).toBe(true);
        }
        const next = suggest(company(route.campaignId, [...completed]));
        expect(next?.links).toEqual(step.links);
        completed.push(step.nodeId);
      }
    }
  });

  it('filters a story link if its discovery rules become stricter', () => {
    const state = company('border_dispute', ['militia_raid']);
    const page = catalog.lore.get('the_shared_mounts');
    expect(page).toBeDefined();
    if (page === undefined) return;
    const restricted = { ...catalog, lore: new Map(catalog.lore).set(page.id, { ...page, unlockNodeId: 'pass_skirmish' }) };
    const next = openingRecommendation(restricted, state, availableNodes(catalog, state));
    expect(next?.links.map((link) => link.id)).not.toContain('the_shared_mounts');
    expect(next?.links.map((link) => link.id)).toContain('hornet_hnt2');
  });
});
