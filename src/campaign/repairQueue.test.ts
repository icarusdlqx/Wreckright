import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { startCampaign } from './campaign';
import { estimateRepair, pristineCondition, repairQueue, startRepair } from './repair';
import { rebuildHulk } from './refit';
import { deserialiseCampaign, serialiseCampaign } from './save';

describe('immediate paid workshop', () => {
  it.each(['border_dispute', 'aurelian_recall'])('restores a fleet without queues or elapsed days: %s', (id) => {
    const campaignId = catalog.campaigns.has(id) ? id : [...catalog.campaigns.keys()][1]!;
    const state = startCampaign(catalog, campaignId, 'instant-workshop');
    const beforeDay = state.day;
    const beforeCash = state.cbills;
    let cost = 0;
    for (const mech of state.mechs) {
      mech.condition.centre_torso.armour = 0;
      const design = structuredClone(mech.design);
      cost += estimateRepair(catalog, mech).cost;
      expect(startRepair(catalog, state, mech).ok).toBe(true);
      expect(mech.condition).toEqual(pristineCondition(catalog, design));
      expect(mech.design).toEqual(design);
      expect(mech.status).toBe('ready');
      expect(mech.readyOnDay).toBe(beforeDay);
    }
    expect(state.day).toBe(beforeDay);
    expect(state.cbills).toBe(beforeCash - cost);
    expect(repairQueue(catalog, state)).toEqual([]);
  });
  it('refuses unaffordable work without changing money, equipment or damage', () => {
    const state = startCampaign(catalog, 'border_dispute', 'poor-repair');
    const mech = state.mechs[0]!;
    mech.condition.left_arm.destroyed = true;
    state.cbills = estimateRepair(catalog, mech).cost - 1;
    const before = serialiseCampaign(state);
    expect(startRepair(catalog, state, mech).ok).toBe(false);
    expect(serialiseCampaign(state)).toBe(before);
  });
  it('accepts exact payment and never charges twice for the same restoration', () => {
    const state = startCampaign(catalog, 'border_dispute', 'exact-repair');
    const mech = state.mechs[0]!;
    mech.condition.right_torso.internal = 1;
    state.cbills = estimateRepair(catalog, mech).cost;
    expect(startRepair(catalog, state, mech).ok).toBe(true);
    expect(state.cbills).toBe(0);
    expect(startRepair(catalog, state, mech).ok).toBe(false);
    expect(state.cbills).toBe(0);
  });
  it('rebuilds a recovered hulk for its quoted full restoration cost', () => {
    const state = startCampaign(catalog, 'border_dispute', 'rebuild-now');
    const mech = state.mechs[0]!;
    mech.status = 'hulk'; mech.rebuildCost = 100_000;
    mech.condition.centre_torso.destroyed = true;
    const quote = estimateRepair(catalog, mech);
    const money = state.cbills;
    expect(rebuildHulk(catalog, state, mech).ok).toBe(true);
    expect(state.cbills).toBe(money - quote.cost);
    expect(mech.status).toBe('ready');
    expect(mech.rebuildCost).toBe(0);
    expect(mech.condition).toEqual(pristineCondition(catalog, mech.design));
  });
  it('honours old paid bookings on load without charges or healing injured pilots', () => {
    const state = startCampaign(catalog, 'border_dispute', 'legacy-booking');
    const mech = state.mechs[0]!;
    mech.status = 'repairing'; mech.readyOnDay = 99;
    mech.condition.left_leg.destroyed = true;
    state.pilots[0]!.recoveryMissions = 1;
    const restored = deserialiseCampaign(serialiseCampaign(state), catalog).state!;
    expect(restored.mechs[0]!.status).toBe('ready');
    expect(restored.mechs[0]!.condition).toEqual(pristineCondition(catalog, mech.design));
    expect(restored.cbills).toBe(state.cbills);
    expect(restored.day).toBe(state.day);
    expect(restored.pilots[0]!.recoveryMissions).toBe(1);
    expect(deserialiseCampaign(serialiseCampaign(restored), catalog).state).toEqual(restored);
  });
});
