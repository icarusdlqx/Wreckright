import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import type { BattleResult } from '../sim/world';
import {
  acceptContract,
  advanceDays,
  availableNodes,
  runMission,
  resolveMission,
  startCampaign,
} from './campaign';
import { campaignOutcomeCount } from './history';
import { estimateRepair, startRepair } from './repair';
import { deserialiseCampaign, serialiseCampaign } from './save';
import { isPilotAvailable, type CampaignState } from './types';

const CAMPAIGN_ID = 'aurelian_recall';
const SPINE = [
  'first_warrant',
  'cutbank_attestation',
  'sarn_inventory',
  'root_exchange',
  'quarry_receipt',
  'conduit_injunction',
  'barrow_warrant',
] as const;
const ENDINGS = [
  { nodeId: 'continuance_export', siblingId: 'local_stewardship' },
  { nodeId: 'local_stewardship', siblingId: 'continuance_export' },
] as const;
const PRIMARY_ROUTE = [...SPINE, 'continuance_export'] as const;
const ADDED_LIVE_CONTRACTS = [
  {
    nodeId: 'root_exchange',
    seed: 'aurelian-live-root_exchange',
    completed: SPINE.slice(0, 3),
  },
  {
    nodeId: 'quarry_receipt',
    seed: 'aurelian-live-quarry_receipt',
    completed: SPINE.slice(0, 4),
  },
  {
    nodeId: 'conduit_injunction',
    seed: 'aurelian-live-conduit_injunction',
    completed: SPINE.slice(0, 5),
  },
  { nodeId: 'barrow_warrant', seed: 'barrow-live-a', completed: SPINE.slice(0, 6) },
  { nodeId: 'continuance_export', seed: 'stage3-campaign-live-0', completed: SPINE },
  { nodeId: 'local_stewardship', seed: 'stage3-campaign-live-0', completed: SPINE },
] as const;

function resolveWithoutCombat(state: CampaignState, won: boolean): void {
  const contract = state.contract;
  if (contract === null) throw new Error('no active contract');
  const battle: BattleResult = {
    seed: 'aurelian-transition',
    missionId: contract.missionId,
    missionStatus: won ? 'success' : 'failure',
    missionReason: won ? 'objectives-complete' : 'objectives-failed',
    objectives: [],
    ticks: 1,
    durationSeconds: 0.1,
    winner: won ? 0 : 1,
    decided: true,
    units: [],
    weapons: [],
  };
  resolveMission(catalog, state, battle, []);
}

function sign(state: CampaignState, nodeId: string): void {
  expect(acceptContract(catalog, state, nodeId, 'fee_first')).toEqual({
    ok: true,
    reason: null,
  });
}

function repairAndRecover(state: CampaignState): void {
  for (const mech of state.mechs) {
    if (mech.status === 'hulk') continue;
    const estimate = estimateRepair(catalog, mech);
    if (estimate.days > 0 && estimate.cost <= state.cbills) startRepair(catalog, state, mech);
  }
  const readyDay = state.mechs.reduce(
    (day, mech) => mech.status === 'repairing' ? Math.max(day, mech.readyOnDay) : day,
    state.day,
  );
  if (readyDay > state.day) advanceDays(catalog, state, readyDay - state.day);
  for (let days = 0; days < 60; days += 1) {
    if (state.pilots.some((pilot) => isPilotAvailable(state, pilot))) return;
    advanceDays(catalog, state, 1);
  }
}

/** Registered from acceptance.test.ts so the mandatory acceptance gate covers both campaigns. */
export function registerAurelianAcceptance(): void {
  describe('Aurelian campaign acceptance', () => {
    it.each(ENDINGS)(
      'recovers from a loss and closes the campaign through $nodeId',
      ({ nodeId, siblingId }) => {
        const state = startCampaign(catalog, CAMPAIGN_ID, `aurelian-acceptance-${nodeId}`);
        expect(availableNodes(catalog, state).map((node) => node.id)).toEqual([SPINE[0]]);

        sign(state, SPINE[0]);
        resolveWithoutCombat(state, false);
        expect(state).toMatchObject({ finished: false, won: false });
        expect(availableNodes(catalog, state).map((node) => node.id)).toEqual([SPINE[0]]);

        SPINE.forEach((spineNodeId, index) => {
          sign(state, spineNodeId);
          resolveWithoutCombat(state, true);
          expect(state.completedNodes).toEqual(SPINE.slice(0, index + 1));
          const next = SPINE[index + 1];
          expect(availableNodes(catalog, state).map((node) => node.id)).toEqual(
            next === undefined ? ENDINGS.map((ending) => ending.nodeId) : [next],
          );
        });

        sign(state, nodeId);
        resolveWithoutCombat(state, true);
        const winningRoute = [...SPINE, nodeId];

        expect(campaignOutcomeCount(state)).toBe(9);
        expect(state.history.at(-1)?.nodeId).toBe(nodeId);
        expect(state).toMatchObject({
          campaignId: CAMPAIGN_ID,
          completedNodes: winningRoute,
          finished: true,
          won: true,
        });
        expect(state.completedNodes).not.toContain(siblingId);
        expect(availableNodes(catalog, state)).toEqual([]);
        expect(acceptContract(catalog, state, siblingId, 'fee_first')).toEqual({
          ok: false,
          reason: 'the campaign is over',
        });

        const restored = deserialiseCampaign(serialiseCampaign(state), catalog).state;
        expect(restored).toMatchObject({
          campaignId: CAMPAIGN_ID,
          completedNodes: winningRoute,
          finished: true,
          won: true,
        });
        expect(restored?.completedNodes).not.toContain(siblingId);
        expect(restored === null ? [] : availableNodes(catalog, restored)).toEqual([]);
      },
    );

    it('resolves the opening arc through live battles', { timeout: 60_000 }, () => {
      const state = startCampaign(catalog, CAMPAIGN_ID, 'aurelian-live');
      for (const nodeId of PRIMARY_ROUTE) {
        if (!availableNodes(catalog, state).some((node) => node.id === nodeId)) break;
        repairAndRecover(state);
        sign(state, nodeId);
        runMission(catalog, state);
      }

      const fought = campaignOutcomeCount(state);
      expect(fought).toBeGreaterThanOrEqual(2);
      expect(state.failedNodes).toEqual([]);
      const last = state.history.at(-1);
      expect(last?.nodeId).toBe(PRIMARY_ROUTE[fought - 1]);
      expect(state.completedNodes).toEqual(
        PRIMARY_ROUTE.slice(0, fought - (last?.won === false ? 1 : 0)),
      );
      if (last?.won === false) {
        expect(availableNodes(catalog, state).map((node) => node.id)).toContain(last.nodeId);
      }
    });

    it.each(ADDED_LIVE_CONTRACTS)(
      'wins the added $nodeId contract through live campaign resolution',
      ({ nodeId, seed, completed }) => {
        const state = startCampaign(catalog, CAMPAIGN_ID, seed);
        state.completedNodes.push(...completed);

        expect(availableNodes(catalog, state).map((node) => node.id)).toContain(nodeId);
        sign(state, nodeId);
        const result = runMission(catalog, state);

        expect(result.outcome).toMatchObject({ nodeId, won: true });
        expect(state.completedNodes).toContain(nodeId);
        if (ENDINGS.some((ending) => ending.nodeId === nodeId)) {
          expect(state).toMatchObject({ finished: true, won: true });
        }
      },
    );
  });
}
