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
const ROUTE = ['first_warrant', 'cutbank_attestation', 'sarn_inventory'] as const;

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
    it('recovers from a loss and reaches the authored victory', () => {
      const state = startCampaign(catalog, CAMPAIGN_ID, 'aurelian-acceptance');
      expect(availableNodes(catalog, state).map((node) => node.id)).toEqual([ROUTE[0]]);

      sign(state, ROUTE[0]);
      resolveWithoutCombat(state, false);
      expect(state).toMatchObject({ finished: false, won: false });
      expect(availableNodes(catalog, state).map((node) => node.id)).toEqual([ROUTE[0]]);

      ROUTE.forEach((nodeId, index) => {
        sign(state, nodeId);
        resolveWithoutCombat(state, true);
        expect(state.completedNodes).toEqual(ROUTE.slice(0, index + 1));
        const next = ROUTE[index + 1];
        expect(availableNodes(catalog, state).map((node) => node.id))
          .toEqual(next === undefined ? [] : [next]);
      });

      expect(campaignOutcomeCount(state)).toBe(4);
      expect(state.history.at(-1)?.nodeId).toBe(ROUTE.at(-1));
      expect(state).toMatchObject({ campaignId: CAMPAIGN_ID, finished: true, won: true });
      expect(acceptContract(catalog, state, ROUTE[0], 'fee_first')).toEqual({
        ok: false,
        reason: 'the campaign is over',
      });

      const restored = deserialiseCampaign(serialiseCampaign(state), catalog).state;
      expect(restored).toMatchObject({
        campaignId: CAMPAIGN_ID,
        completedNodes: [...ROUTE],
        finished: true,
        won: true,
      });
    });

    it('resolves the opening arc through live battles', { timeout: 60_000 }, () => {
      const state = startCampaign(catalog, CAMPAIGN_ID, 'aurelian-live');
      for (const nodeId of ROUTE) {
        if (!availableNodes(catalog, state).some((node) => node.id === nodeId)) break;
        repairAndRecover(state);
        sign(state, nodeId);
        runMission(catalog, state);
      }

      const fought = campaignOutcomeCount(state);
      expect(fought).toBeGreaterThanOrEqual(2);
      expect(state.failedNodes).toEqual([]);
      const last = state.history.at(-1);
      expect(last?.nodeId).toBe(ROUTE[fought - 1]);
      expect(state.completedNodes).toEqual(
        ROUTE.slice(0, fought - (last?.won === false ? 1 : 0)),
      );
      if (last?.won === false) {
        expect(availableNodes(catalog, state).map((node) => node.id)).toContain(last.nodeId);
      }
    });
  });
}
