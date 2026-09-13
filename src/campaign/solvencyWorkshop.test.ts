import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { acceptContract, advanceDays, startCampaign } from './campaign';
import { saleValueOf, sellMech } from './market';
import { fitFromStore, rebuildHulk } from './refit';
import { estimateRepair, startRepair } from './repair';
import { assessSolvency, retireCompany } from './solvency';
import { addToStore, type CampaignState, type MechRecord } from './types';

function campaign(seed: string): CampaignState {
  const state = startCampaign(catalog, 'border_dispute', seed);
  // These recovery scenarios model a company that has used its demo stock.
  state.store = [];
  return state;
}

function stripWeapons(mech: MechRecord): string {
  const weaponId = mech.design.mounts[0]?.weaponId;
  if (weaponId === undefined) throw new Error('test mech has no weapon');
  const chassis = catalog.chassis.get(mech.design.chassisId);
  mech.design = {
    ...structuredClone(mech.design),
    mounts: [],
    ammo: [],
    equipment: [],
    heatSinks: chassis?.internalHeatSinks ?? mech.design.heatSinks,
  };
  return weaponId;
}

describe('company solvency workshop paths', () => {
  it('can enact the rebuild plan it reports', () => {
    const state = campaign('rebuild-plan');
    const mech = state.mechs[0];
    if (mech === undefined) throw new Error('campaign has no mech');
    state.mechs = [mech];
    mech.status = 'hulk';
    mech.condition.left_torso.armour = 0;
    mech.condition.left_torso.internal = 1;
    mech.rebuildCost = 100_000;
    const quote = estimateRepair(catalog, mech);
    state.cbills = quote.cost;

    expect(assessSolvency(catalog, state)).toMatchObject({
      state: 'fundable',
      plan: { mechCost: quote.cost, mechReadyOnDay: state.day },
    });
    expect(rebuildHulk(catalog, state, mech).ok).toBe(true);
    const readyOnDay = mech.readyOnDay;
    advanceDays(catalog, state, readyOnDay - state.day);
    expect(assessSolvency(catalog, state).state).toBe('fieldable');
  });

  it('projects and enacts a hulk rebuild with one banked workshop day', () => {
    const state = campaign('credited-rebuild-plan');
    const mech = state.mechs[0];
    if (mech === undefined) throw new Error('campaign has no mech');
    state.mechs = [mech];
    mech.status = 'hulk';
    mech.rebuildCost = 100_000;
    const quote = estimateRepair(catalog, mech);
    state.cbills = quote.cost;
    state.eventEffects.freeRepairDays = 1;
    const creditedReady = state.day;

    expect(assessSolvency(catalog, state)).toMatchObject({
      state: 'fundable',
      plan: { mechId: mech.id, mechCost: quote.cost, mechReadyOnDay: creditedReady },
    });
    expect(state.eventEffects.freeRepairDays).toBe(1);
    expect(rebuildHulk(catalog, state, mech).ok).toBe(true);
    expect(mech.readyOnDay).toBe(creditedReady);
    expect(state.eventEffects.freeRepairDays).toBe(1);
  });

  it('only treats a stripped hull as recoverable when a stored weapon fits it', () => {
    const state = campaign('stripped-recovery');
    const mech = state.mechs[0];
    if (mech === undefined) throw new Error('campaign has no mech');
    state.mechs = [mech];
    const weaponId = stripWeapons(mech);
    mech.status = 'hulk';
    mech.rebuildCost = 100_000;
    const quote = estimateRepair(catalog, mech);
    state.cbills = Math.max(quote.cost, 100_000_000);

    expect(assessSolvency(catalog, state).plan?.mechId).not.toBe(mech.id);

    addToStore(state, 'weapon', weaponId);
    const weaponName = catalog.weapons.get(weaponId)?.name;
    expect(assessSolvency(catalog, state)).toMatchObject({
      state: 'fundable',
      plan: {
        mechId: mech.id,
        mechCost: quote.cost,
        mechNeedsRebuild: true,
        mechNeedsWeapon: true,
        weaponId,
        weaponName,
      },
    });

    expect(rebuildHulk(catalog, state, mech).ok).toBe(true);
    state.store = [];
    expect(assessSolvency(catalog, state).plan?.mechId).not.toBe(mech.id);
    addToStore(state, 'weapon', weaponId);
    expect(assessSolvency(catalog, state)).toMatchObject({
      state: 'fundable',
      action: 'finance',
      recoverOnDay: null,
      plan: { mechId: mech.id, mechNeedsWeapon: true, weaponId },
    });
    advanceDays(catalog, state, mech.readyOnDay - state.day);
    expect(assessSolvency(catalog, state)).toMatchObject({
      state: 'fundable', plan: { mechNeedsWeapon: true, weaponId },
    });
    expect(fitFromStore(catalog, state, mech, weaponId).ok).toBe(true);
    expect(assessSolvency(catalog, state).state).toBe('fieldable');
  });

  it('does not retire a company in debt when fitting its stored weapon is free', () => {
    const state = campaign('free-fit-in-debt');
    const mech = state.mechs[0];
    if (mech === undefined) throw new Error('campaign has no mech');
    state.mechs = [mech];
    const weaponId = stripWeapons(mech);
    addToStore(state, 'weapon', weaponId);
    state.cbills = -1_000_000;

    expect(assessSolvency(catalog, state)).toMatchObject({
      state: 'fundable',
      action: 'finance',
      plan: { mechId: mech.id, mechCost: 0, mechNeedsWeapon: true, needsSale: false },
    });
    expect(retireCompany(catalog, state)).toEqual({
      ok: false,
      reason: 'the company still has a recovery path',
    });
    expect(fitFromStore(catalog, state, mech, weaponId).ok).toBe(true);
    expect(assessSolvency(catalog, state).state).toBe('fieldable');
  });

  it('uses the queued full rebuild date when checking a signed deadline', () => {
    const state = campaign('queued-rebuild-deadline');
    const [booked, hulk] = state.mechs;
    if (booked === undefined || hulk === undefined) throw new Error('campaign needs two mechs');
    state.mechs = [booked, hulk];
    stripWeapons(booked);
    booked.condition.centre_torso.armour = 0;
    expect(startRepair(catalog, state, booked).ok).toBe(true);

    hulk.status = 'hulk';
    hulk.condition.left_torso.armour = 0;
    hulk.condition.left_torso.internal = 1;
    hulk.rebuildCost = 100_000;
    const quote = estimateRepair(catalog, hulk);
    state.cbills = quote.cost;
    expect(acceptContract(catalog, state, 'militia_raid', 'standard').ok).toBe(true);
    if (state.contract === null) throw new Error('contract was not signed');
    state.contract.deadlineDay = state.day + quote.days;

    const queuedReady = state.day;
    expect(assessSolvency(catalog, state)).toMatchObject({
      state: 'fundable',
      action: 'finance',
      recoverOnDay: null,
      plan: { mechId: hulk.id, mechCost: quote.cost, mechReadyOnDay: queuedReady },
    });
  });

  it('waits for a paid booking before spending its eventual yard value', () => {
    const state = campaign('repair-sale-clock');
    const byValue = [...state.mechs].sort(
      (left, right) => saleValueOf(catalog, left) - saleValueOf(catalog, right),
    );
    const hulk = byValue[0];
    const booked = byValue.at(-1);
    if (hulk === undefined || booked === undefined || hulk === booked) {
      throw new Error('campaign needs distinct hull values');
    }
    state.mechs = [hulk, booked];
    stripWeapons(booked);
    booked.condition.centre_torso.armour = 0;
    expect(startRepair(catalog, state, booked).ok).toBe(true);

    hulk.status = 'hulk';
    hulk.rebuildCost = Math.max(1, saleValueOf(catalog, hulk));
    const quote = estimateRepair(catalog, hulk);
    state.cbills = 0;
    expect(assessSolvency(catalog, state).plan?.saleProceeds).toBeGreaterThanOrEqual(quote.cost);
    expect(sellMech(catalog, state, booked.id).ok).toBe(true);
    expect(rebuildHulk(catalog, state, hulk).ok).toBe(true);
    advanceDays(catalog, state, hulk.readyOnDay - state.day);
    expect(assessSolvency(catalog, state).state).toBe('fieldable');
  });
});
