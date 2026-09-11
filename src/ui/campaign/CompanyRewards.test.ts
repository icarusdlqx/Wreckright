import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { startCampaign, resolveMission } from '../../campaign/campaign';
import { rewardBattle, rewardFixture } from '../../campaign/missionRewardFixtures';
import { CompanyEpilogue } from './CompanyEpilogue';
import { ContractRewards, RewardReceipt } from './CompanyRewards';
import { ContractBriefing } from './ContractBriefing';

const rewards = [{ id: 'cache', label: 'Service cabinet', objectiveId: 'cache',
  items: [{ kind: 'weapon' as const, itemId: 'medium_laser', count: 2 }],
  effects: { freeRepairDays: 1 }, afterword: 'The workshop opens a place in its schedule.' }];

describe('company reward presentation', () => {
  it('shows guaranteed conditions and benefits in the unsigned briefing, without promising random salvage', () => {
    const { content, state } = rewardFixture(rewards);
    const contract = state.contract!;
    state.contract = null;
    const before = JSON.stringify(state);
    const html = renderToStaticMarkup(createElement(ContractBriefing, {
      catalog: content, state, missionId: contract.missionId, nodeId: contract.nodeId, deadlineDay: 20,
    }));
    expect(html).toContain('data-testid="contract-rewards"');
    expect(html).toContain('Win the contract and complete: Secure the cache');
    expect(html).toContain('Medium Laser ×2');
    expect(html).toContain('workshop day credit');
    expect(html).toContain('separate from salvage rolls');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('shows the exact delivered reward and marks an already claimed offer', () => {
    const { content, state, deployment } = rewardFixture(rewards);
    const nodeId = state.contract!.nodeId;
    const run = resolveMission(content, state, rewardBattle(deployment.missionId, deployment.lance), deployment.lance, false);
    const html = renderToStaticMarkup(createElement(RewardReceipt, { catalog: content, rewards: run.outcome.campaignRewards! }));
    expect(html).toContain('Contract rewards delivered');
    expect(html).toContain(rewards[0]!.afterword);
    expect(html).toContain('To stores: Medium Laser ×2');
    expect(html).toContain('1 workshop day credit banked');
    expect(renderToStaticMarkup(createElement(ContractRewards, { catalog: content, state, nodeId }))).toContain('Already delivered');
  });

  it('shows the chosen ending, returning portraits, wounds and remembered crew', () => {
    const state = startCampaign(catalog, 'border_dispute', 'company-ending');
    state.finished = state.won = true;
    state.completedNodes.push('depot_take');
    state.pilots[0]!.recoveryMissions = 1;
    state.pilots[1]!.dead = true;
    const html = renderToStaticMarkup(createElement(CompanyEpilogue, { catalog, state }));
    expect(html).toContain('The Company Seal');
    expect(html).toContain('class="epilogue-story"');
    expect(html).toContain('class="epilogue-company"');
    expect(html).not.toContain('The Unwritten Claim');
    expect(html).toContain('Returned wounded');
    expect(html).toContain(`Portrait of ${state.pilots[0]!.name}`);
    expect(html).toContain(`Remembered: ${state.pilots[1]!.name}`);
    state.won = false;
    expect(renderToStaticMarkup(createElement(CompanyEpilogue, { catalog, state }))).toBe('');
  });
});
