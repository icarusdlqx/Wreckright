import { describe, expect, it } from 'vitest';
import { startCampaign } from '../../campaign/campaign';
import { wreckedCondition } from '../../campaign/repair';
import { getCatalog } from '../../schema/load';
import { companyMachineName } from '../designLabel';
import { campaignNextSteps } from './nextSteps';

const catalog = getCatalog();

function fresh() {
  const state = startCampaign(catalog, 'border_dispute', 'next-steps');
  return state;
}

describe('campaign next steps', () => {
  it('points at the contract board when nothing is signed and nothing needs work', () => {
    const state = fresh();
    const steps = campaignNextSteps(catalog, state, (mech) => companyMachineName(catalog, state.mechs, mech));
    expect(steps.map((step) => step.id)).toEqual(['contract']);
    expect(steps[0]?.target).toBe('contract');
  });

  it('puts a wreck and a debt ahead of routine advice, naming the machine by its mark', () => {
    const state = fresh();
    const wreck = state.mechs[0];
    if (wreck === undefined) throw new Error('fixture has no mechs');
    wreck.status = 'hulk';
    wreck.condition = wreckedCondition(catalog, wreck.design);
    state.cbills = -25_000;
    const steps = campaignNextSteps(catalog, state, (mech) => companyMachineName(catalog, state.mechs, mech));

    expect(steps[0]?.id).toBe('debt');
    expect(steps[1]?.id).toBe(`wreck-${wreck.id}`);
    expect(steps[1]?.text).toContain('Gadfly (mark I) is a wreck');
    expect(steps[1]?.text).toMatch(/Rebuild: [\d,]+ C, \d+ days?\./);
    expect(steps.every((step, index) => index === 0 || step.tone !== 'warn' || steps[index - 1]?.tone === 'warn')).toBe(true);
  });

  it('warns when a booked machine will miss the signed deadline', () => {
    const state = fresh();
    const mech = state.mechs[1];
    if (mech === undefined) throw new Error('fixture has no mechs');
    state.contract = {
      nodeId: 'militia_raid',
      missionId: 'line_maintenance',
      employerId: 'halloran_freight',
      employerName: 'Halloran Freight',
      termsId: 'standard',
      payout: 850_000,
      salvageShare: 0.375,
      acceptedOnDay: 0,
      deadlineDay: 10,
    };
    mech.status = 'repairing';
    mech.readyOnDay = 30;
    const steps = campaignNextSteps(catalog, state, (mech) => companyMachineName(catalog, state.mechs, mech));
    const late = steps.find((step) => step.id === `late-${mech.id}`);
    expect(late?.tone).toBe('warn');
    expect(late?.text).toContain('after the day 10 deadline');
  });

  it('never returns more than five steps', () => {
    const state = fresh();
    for (const mech of state.mechs) {
      mech.status = 'hulk';
      mech.condition = wreckedCondition(catalog, mech.design);
    }
    state.cbills = -1;
    state.store.push({ kind: 'weapon', itemId: 'lrm20', count: 1 });
    const steps = campaignNextSteps(catalog, state, (mech) => companyMachineName(catalog, state.mechs, mech));
    expect(steps.length).toBeLessThanOrEqual(5);
  });
});
