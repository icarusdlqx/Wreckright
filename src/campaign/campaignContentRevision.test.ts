import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import type { Campaign } from '../schema/campaign';
import type { BattleResult } from '../sim/world';
import {
  acceptContract,
  campaignNodes,
  resolveMission,
  startCampaign,
} from './campaign';
import { campaignRouteForRevision } from './campaignRoute';
import { applyCampaignRewards, earnedCampaignRewards } from './missionRewards';
import { deserialiseCampaign, serialiseCampaign } from './save';
import type { CampaignState } from './types';

const campaigns = ['border_dispute', 'aurelian_recall'] as const;

function campaign(id: string): Campaign {
  const value = catalog.campaigns.get(id);
  if (value === undefined) throw new Error(`missing campaign ${id}`);
  return value;
}

function withoutContentRevision(state: CampaignState): string {
  const value = JSON.parse(serialiseCampaign(state)) as {
    state: Record<string, unknown>;
  };
  delete value.state.campaignContentRevision;
  return JSON.stringify(value);
}

function success(missionId: string): BattleResult {
  return {
    seed: 'content-revision',
    missionId,
    missionStatus: 'success',
    missionReason: 'objectives-complete',
    objectives: [],
    ticks: 1,
    durationSeconds: 0.05,
    winner: 0,
    decided: true,
    units: [],
    weapons: [],
  };
}

function signAndResolve(state: CampaignState, nodeId: string): void {
  expect(acceptContract(catalog, state, nodeId, 'standard')).toMatchObject({ ok: true });
  const missionId = state.contract?.missionId;
  if (missionId === undefined) throw new Error(`no mission for ${nodeId}`);
  resolveMission(catalog, state, success(missionId), [], false);
}

function completePrerequisites(state: CampaignState, nodeId: string): void {
  const data = campaign(state.campaignId);
  const route = campaignRouteForRevision(data, state.campaignContentRevision);
  if (route === null) throw new Error('missing route fixture');
  const byId = new Map(route.nodes.map((node) => [node.id, node]));
  const visit = (id: string): void => {
    const node = byId.get(id);
    if (node === undefined) throw new Error(`missing route node ${id}`);
    for (const required of node.requires) {
      visit(required);
      if (!state.completedNodes.includes(required)) state.completedNodes.push(required);
    }
  };
  visit(nodeId);
}

describe('campaign content revisions', () => {
  it.each(campaigns)('starts new %s companies on the current route', (campaignId) => {
    const data = campaign(campaignId);
    const state = startCampaign(catalog, campaignId, `new:${campaignId}`);

    expect(data.contentRevision).toBe(2);
    expect(state.campaignContentRevision).toBe(data.contentRevision);
    expect(deserialiseCampaign(serialiseCampaign(state), catalog).state)
      .toMatchObject({ campaignId, campaignContentRevision: 2 });
  });

  it('promotes rescue and workshop defence only for new Linewrought companies', () => {
    const current = startCampaign(catalog, 'border_dispute', 'new-line');
    current.completedNodes.push('militia_raid');
    expect(campaignNodes(catalog, current).map((node) => node.id)).toEqual(
      expect.arrayContaining(['marker_survey', 'recovery_window', 'supply_line']),
    );
    expect(campaignNodes(catalog, current).map((node) => node.id)).not.toContain('pass_skirmish');

    const old = startCampaign(catalog, 'border_dispute', 'old-line');
    old.campaignContentRevision = 1;
    old.completedNodes.push('militia_raid');
    const restored = deserialiseCampaign(withoutContentRevision(old), catalog).state;
    expect(restored?.campaignContentRevision).toBe(1);
    expect(campaignNodes(catalog, restored!).map((node) => node.id)).toEqual(
      expect.arrayContaining(['marker_survey', 'pass_skirmish', 'supply_line']),
    );
    expect(campaignNodes(catalog, restored!).map((node) => node.id)).not.toContain('recovery_window');
  });

  it.each([
    ['border_dispute', ['militia_raid', 'pass_skirmish', 'foundry_sweep_node'], 'shale_overwatch_node'],
    ['aurelian_recall', ['first_warrant', 'cutbank_attestation', 'sarn_inventory'], 'root_exchange'],
  ] as const)('restores an unversioned mid-campaign %s route', (campaignId, done, next) => {
    const state = startCampaign(catalog, campaignId, `mid:${campaignId}`);
    state.campaignContentRevision = 1;
    state.completedNodes.push(...done);

    const restored = deserialiseCampaign(withoutContentRevision(state), catalog).state;
    expect(restored).not.toBeNull();
    expect(restored?.completedNodes).toEqual(done);
    expect(campaignNodes(catalog, restored!).map((node) => node.id)).toContain(next);
  });

  it.each([
    ['border_dispute', ['militia_raid'], 'pass_skirmish'],
    ['aurelian_recall', ['first_warrant'], 'cutbank_attestation'],
  ] as const)('retains and resolves an active legacy %s contract', (campaignId, done, nodeId) => {
    const state = startCampaign(catalog, campaignId, `active:${campaignId}`);
    state.campaignContentRevision = 1;
    state.completedNodes.push(...done);
    expect(acceptContract(catalog, state, nodeId, 'standard').ok).toBe(true);
    if (state.contract === null) throw new Error('legacy contract was not signed');
    state.contract.payout = 123_456;

    const restored = deserialiseCampaign(withoutContentRevision(state), catalog).state;
    expect(restored?.contract).toMatchObject({ nodeId, payout: 123_456 });
    resolveMission(catalog, restored!, success(restored!.contract!.missionId), [], false);

    expect(restored?.completedNodes).toContain(nodeId);
    expect(restored?.history.at(-1)?.payout).toBe(123_456);
    expect(restored?.contract).toBeNull();
  });

  it('keeps an authored reward claimed exactly once through repeated legacy reloads', () => {
    const state = startCampaign(catalog, 'border_dispute', 'reward-once');
    state.campaignContentRevision = 1;
    state.completedNodes.push('militia_raid');
    const before = state.store.find((item) => item.itemId === 'er_medium_laser')?.count ?? 0;
    expect(acceptContract(catalog, state, 'pass_skirmish', 'standard').ok).toBe(true);
    const contract = state.contract!;
    const grants = earnedCampaignRewards(catalog, state, contract, success(contract.missionId), 1);
    applyCampaignRewards(catalog, state, grants);
    applyCampaignRewards(catalog, state, grants);
    state.completedNodes.push('pass_skirmish');
    state.contract = null;

    const once = deserialiseCampaign(serialiseCampaign(state), catalog).state!;
    const twice = deserialiseCampaign(serialiseCampaign(once), catalog).state!;
    const optics = twice.store.find((item) => item.itemId === 'er_medium_laser');
    expect(optics?.count).toBe(before + 2);
    expect(twice.claimedRewardIds.filter((id) => id.endsWith('/foundry_optics'))).toHaveLength(1);
    expect(campaignNodes(catalog, twice).map((node) => node.id)).not.toContain('pass_skirmish');
  });

  it.each([
    ['border_dispute', 'depot_burn'],
    ['border_dispute', 'depot_take'],
    ['aurelian_recall', 'continuance_export'],
    ['aurelian_recall', 'local_stewardship'],
  ] as const)('preserves completed legacy ending %s/%s', (campaignId, endingId) => {
    const state = startCampaign(catalog, campaignId, `ending:${endingId}`);
    state.campaignContentRevision = 1;
    completePrerequisites(state, endingId);
    signAndResolve(state, endingId);
    expect(state).toMatchObject({ finished: true, won: true });

    const restored = deserialiseCampaign(withoutContentRevision(state), catalog).state;
    expect(restored).toMatchObject({
      campaignId,
      campaignContentRevision: 1,
      finished: true,
      won: true,
    });
    expect(restored?.completedNodes).toContain(endingId);
  });

  it.each(campaigns)('keeps every current and legacy %s ending reachable', (campaignId) => {
    const data = campaign(campaignId);
    for (const revision of [1, data.contentRevision]) {
      const route = campaignRouteForRevision(data, revision);
      expect(route).not.toBeNull();
      const completed = new Set<string>();
      let changed = true;
      while (changed) {
        changed = false;
        for (const node of route!.nodes) {
          if (completed.has(node.id) || !node.requires.every((id) => completed.has(id))) continue;
          if (node.id === route!.victoryNodeId || route!.alternateVictoryNodeIds.includes(node.id)) continue;
          completed.add(node.id);
          changed = true;
        }
      }
      for (const ending of [route!.victoryNodeId, ...route!.alternateVictoryNodeIds]) {
        const node = route!.nodes.find((entry) => entry.id === ending);
        expect(node?.requires.every((id) => completed.has(id)), `${campaignId}@${revision}:${ending}`)
          .toBe(true);
      }
    }
  });

  it('rejects a save from an unavailable future content revision', () => {
    const state = startCampaign(catalog, 'border_dispute', 'future');
    state.campaignContentRevision = 99;
    const parsed = deserialiseCampaign(serialiseCampaign(state), catalog);
    expect(parsed.state).toBeNull();
    expect(parsed.error).toContain('content revision 99');
  });
});
