import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { acceptContract, availableNodes, startCampaign } from '../../campaign/campaign';
import { dailyPayroll } from '../../campaign/ledger';
import { startRepair } from '../../campaign/repair';
import { serialiseCampaign } from '../../campaign/save';
import { CampaignNextStep } from './CampaignNextStep';
import { CampaignRouteList } from './CampaignRouteList';
import { CampaignWaiting } from './CampaignWaiting';
import { companyWait, mainStoryNodeIds, missingPrerequisites, nextCampaignNode, nextRepairWait, waitCompany } from './campaignFlow';

describe('company mission continuation', () => {
  it.each([
    ['border_dispute', 'militia_raid', 'recovery_window', 'marker_survey'],
    ['aurelian_recall', 'first_warrant', 'cutbank_attestation', 'custody_survey'],
  ])('prioritises the next main story contract for %s without signing or spending', (campaignId, first, next, optional) => {
    const state = startCampaign(catalog, campaignId, 'next-story');
    state.completedNodes.push(first!);
    const before = serialiseCampaign(state);
    const campaign = catalog.campaigns.get(campaignId!)!;
    expect(nextCampaignNode(catalog, state)?.id).toBe(next);
    expect(mainStoryNodeIds(campaign).has(optional!)).toBe(false);
    expect(serialiseCampaign(state)).toBe(before);
    const html = renderToStaticMarkup(createElement(CampaignRouteList, {
      campaign, state, open: availableNodes(catalog, state), selectedId: next!, onReview: () => undefined,
    }));
    expect(html).toContain(`data-testid="camp-route-review-${next}"`);
    expect(html).toContain('Optional work');
    expect(html).toContain('Upcoming story');
    const unsigned = renderToStaticMarkup(createElement(CampaignNextStep, {
      catalog, state, node: nextCampaignNode(catalog, state), onContinue: () => undefined,
    }));
    expect(unsigned).toContain('does not advance the calendar');
    expect(unsigned).toContain('Review next mission');
  });

  it('recommends the preserved next stage for a legacy Linewrought company', () => {
    const state = startCampaign(catalog, 'border_dispute', 'legacy-next');
    state.campaignContentRevision = 1;
    state.completedNodes.push('militia_raid');
    expect(nextCampaignNode(catalog, state)?.id).toBe('pass_skirmish');
  });

  it('keeps both endings available and labels the actual missing prerequisites', () => {
    const state = startCampaign(catalog, 'border_dispute', 'ending-choice');
    const campaign = catalog.campaigns.get(state.campaignId)!;
    const endings = [campaign.victoryNodeId, ...campaign.alternateVictoryNodeIds];
    const final = campaign.nodes.find((node) => node.id === endings[0])!;
    expect(missingPrerequisites(campaign, final, [])).toEqual(['Manifest Key']);
    state.completedNodes = [...mainStoryNodeIds(campaign)].filter((id) => !endings.includes(id));
    const html = renderToStaticMarkup(createElement(CampaignRouteList, {
      campaign, state, open: availableNodes(catalog, state), selectedId: null, onReview: () => undefined,
    }));
    for (const id of endings) expect(html).toContain(`camp-route-review-${id}`);
    expect(html).toContain('Review either ending before signing');
  });

  it('continues an already signed mission at outfitting, never replaces it with a recommendation', () => {
    const state = startCampaign(catalog, 'border_dispute', 'active-flow');
    expect(acceptContract(catalog, state, 'militia_raid', 'standard').ok).toBe(true);
    expect(nextCampaignNode(catalog, state)).toBeNull();
    const html = renderToStaticMarkup(createElement(CampaignNextStep, { catalog, state, node: null, onContinue: () => undefined }));
    expect(html).toContain('First Notice');
    expect(html).toContain('Outfit mechs &amp; choose lance');
    state.finished = true;
    expect(renderToStaticMarkup(createElement(CampaignNextStep, { catalog, state, node: null, onContinue: () => undefined }))).toBe('');
  });
});

describe('explicit workshop waiting', () => {
  it('quotes wages, has no unbooked repair shortcut, and keeps the calendar secondary', () => {
    const state = startCampaign(catalog, 'border_dispute', 'wait-quote');
    expect(nextRepairWait(catalog, state)).toBeNull();
    expect(companyWait(catalog, state, state.day + 2).wages).toBe(dailyPayroll(catalog, state) * 2);
    const html = renderToStaticMarkup(createElement(CampaignWaiting, { catalog, state, onWait: () => undefined }));
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain('It does not start the next mission');
    expect(html).toContain('No repairs are currently booked');
    expect(html).toContain('do not recover by waiting');
  });

  it('waits only to the next paid repair and preserves the mission injury hold', () => {
    const state = startCampaign(catalog, 'border_dispute', 'wait-repairs');
    const first = state.mechs[0]!;
    const second = state.mechs[1]!;
    first.condition.centre_torso.armour -= 10;
    second.condition.centre_torso.armour -= 10;
    expect(startRepair(catalog, state, first).ok).toBe(true);
    expect(startRepair(catalog, state, second).ok).toBe(true);
    const wounded = state.pilots[0]!;
    wounded.recoveryMissions = 1;
    const quote = nextRepairWait(catalog, state)!;
    const secondDay = second.readyOnDay;
    const balance = state.cbills;
    expect(quote.targetDay).toBe(first.readyOnDay);
    waitCompany(catalog, state, quote.targetDay);
    expect(state.day).toBe(quote.targetDay);
    expect(first.status).toBe('ready');
    if (secondDay > state.day) expect(second.status).toBe('repairing');
    expect(wounded.recoveryMissions).toBe(1);
    expect(state.cbills).toBe(balance - quote.wages);
  });

  it('refuses an unaffordable wait without mutating the company', () => {
    const state = startCampaign(catalog, 'border_dispute', 'wait-poor');
    state.cbills = dailyPayroll(catalog, state) - 1;
    const before = serialiseCampaign(state);
    expect(waitCompany(catalog, state, state.day + 1)).toContain('cannot cover wages');
    expect(serialiseCampaign(state)).toBe(before);
  });

  it('permits the signed deadline day but prevents silent contract expiry or recovery charges', () => {
    const state = startCampaign(catalog, 'border_dispute', 'wait-deadline');
    acceptContract(catalog, state, 'militia_raid', 'standard');
    state.contract!.deadlineDay = state.day + 1;
    const before = serialiseCampaign(state);
    expect(waitCompany(catalog, state, state.day + 2)).toContain('Deploy or withdraw');
    expect(serialiseCampaign(state)).toBe(before);
    waitCompany(catalog, state, state.day + 1);
    expect(state.contract?.nodeId).toBe('militia_raid');
    expect(companyWait(catalog, state, state.day + 1).blocked).toContain('signed contract is due');
  });
});
