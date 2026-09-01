import { describe, expect, it } from 'vitest';
import { acceptContract, startCampaign } from '../../campaign/campaign';
import { pristineCondition } from '../../campaign/repair';
import type { CampaignState } from '../../campaign/types';
import type { Catalog } from '../../schema/load';
import { catalog } from '../../../tests/support';
import { canLaunchFirstDropDirectly } from './firstDropLaunch';

function signedCompany(): CampaignState {
  const state = startCampaign(catalog, 'border_dispute', 'direct-launch');
  const signed = acceptContract(catalog, state, 'militia_raid', 'standard');
  if (!signed.ok) throw new Error(signed.reason ?? 'contract was not signed');
  return state;
}

function firstPair(state: CampaignState) {
  const pilot = state.pilots[0];
  const mech = state.mechs[0];
  if (pilot === undefined || mech === undefined) throw new Error('starting company is incomplete');
  return { pilot, mech };
}

describe('first-drop direct launch', () => {
  it('allows a pristine, fully assigned company that fits the signed mission', () => {
    expect(canLaunchFirstDropDirectly(catalog, signedCompany())).toBe(true);
  });

  it('requires an active contract', () => {
    const state = signedCompany();
    state.contract = null;
    expect(canLaunchFirstDropDirectly(catalog, state)).toBe(false);
  });

  it('catches real armour damage even while the roster status still says ready', () => {
    const state = signedCompany();
    const { mech } = firstPair(state);
    mech.condition.left_torso.armour -= 1;
    expect(mech.status).toBe('ready');
    expect(canLaunchFirstDropDirectly(catalog, state)).toBe(false);
  });

  it.each([
    ['missing machine', (state: CampaignState) => { state.pilots[0]!.mechId = 'missing'; }],
    ['empty seat', (state: CampaignState) => { state.pilots[0]!.mechId = null; }],
    ['duplicate assignment', (state: CampaignState) => {
      state.pilots[1]!.mechId = state.pilots[0]!.mechId;
    }],
  ])('routes %s through prep', (_name, alter) => {
    const state = signedCompany();
    alter(state);
    expect(canLaunchFirstDropDirectly(catalog, state)).toBe(false);
  });

  it('routes a short roster through prep even when every remaining pair is ready', () => {
    const state = signedCompany();
    const removed = state.pilots.pop();
    if (removed?.mechId === null || removed?.mechId === undefined) {
      throw new Error('starting pilot has no assigned machine');
    }
    state.mechs = state.mechs.filter((mech) => mech.id !== removed.mechId);
    expect(canLaunchFirstDropDirectly(catalog, state)).toBe(false);
  });

  it.each([
    ['injured', (state: CampaignState) => { state.pilots[0]!.injuredUntilDay = state.day + 1; }],
    ['benched', (state: CampaignState) => { state.benched.push(state.pilots[0]!.id); }],
    ['dead', (state: CampaignState) => { state.pilots[0]!.dead = true; }],
  ])('routes an %s pilot through prep', (_name, alter) => {
    const state = signedCompany();
    alter(state);
    expect(canLaunchFirstDropDirectly(catalog, state)).toBe(false);
  });

  it.each(['hulk', 'repairing'] as const)('routes a %s machine through prep', (status) => {
    const state = signedCompany();
    firstPair(state).mech.status = status;
    expect(canLaunchFirstDropDirectly(catalog, state)).toBe(false);
  });

  it('rejects an unarmed assigned machine', () => {
    const state = signedCompany();
    firstPair(state).mech.design.mounts = [];
    expect(canLaunchFirstDropDirectly(catalog, state)).toBe(false);
  });

  it('rejects an assigned machine with an illegal design', () => {
    const state = signedCompany();
    const { mech } = firstPair(state);
    mech.design.mounts[0]!.weaponId = 'not_a_weapon';
    expect(canLaunchFirstDropDirectly(catalog, state)).toBe(false);
  });

  it('requires every assignment to survive the mission drop limits', () => {
    const state = signedCompany();
    const missionId = state.contract?.missionId;
    const mission = missionId === undefined ? undefined : catalog.missions.get(missionId);
    if (missionId === undefined || mission === undefined) throw new Error('missing signed mission');
    const constrained = {
      ...catalog,
      missions: new Map(catalog.missions).set(
        missionId,
        { ...mission, dropTonnage: 0 },
      ),
    } satisfies Catalog;

    expect(canLaunchFirstDropDirectly(constrained, state)).toBe(false);
  });

  it('ignores an unassigned damaged spare', () => {
    const state = signedCompany();
    const spare = structuredClone(state.mechs[0]);
    if (spare === undefined) throw new Error('starting company has no machine');
    spare.id = 'damaged-spare';
    spare.condition = pristineCondition(catalog, spare.design);
    spare.condition.right_leg.internal -= 1;
    state.mechs.push(spare);

    expect(canLaunchFirstDropDirectly(catalog, state)).toBe(true);
  });
});
