import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { validateDesign } from '../schema/designValidation';
import { startCampaign, acceptContract } from './campaign';
import { prepareDeployment } from './deployment';
import { fitFromStore, planFit, stripToStore } from './refit';
import { pristineCondition } from './repair';
import { deserialiseCampaign, serialiseCampaign } from './save';
import { assessSolvency } from './solvency';
import { storeCount } from './types';

function company(designId: string, bare = false) {
  const state = startCampaign(catalog, 'border_dispute', 'separate-ammunition');
  const mech = state.mechs[0]!;
  mech.design = structuredClone(catalog.designs.get(designId)!);
  if (bare) { mech.design.mounts = []; mech.design.ammo = []; }
  mech.condition = pristineCondition(catalog, mech.design);
  state.mechs = [mech];
  state.pilots = state.pilots.slice(0, 1);
  state.pilots[0]!.mechId = mech.id;
  state.store = [];
  state.cbills = 0;
  return { state, mech };
}

describe('campaign fitting across separate weapon and ammunition bays', () => {
  it.each([
    ['rivet_escort', 'ac5'], ['sentinel_brawler', 'ac5'],
    ['trestle_battery', 'ac5'], ['falchion_duellist', 'lbx_ac10'],
  ])('recognises zero-credit recovery of %s with its stored %s', (designId, weaponId) => {
    const { state, mech } = company(designId, true);
    state.store = [{ kind: 'weapon', itemId: weaponId, count: 1 }];
    mech.condition.centre_torso.armour -= 4;
    mech.condition.left_leg.internal -= 2;
    const internal = mech.condition.left_leg.internal;
    const before = structuredClone(state);
    const plan = planFit(catalog, mech.design, weaponId);
    expect(plan).not.toBeNull();
    expect(state).toEqual(before);
    const bin = plan!.design.ammo.find((entry) => entry.weaponId === weaponId)!;
    expect(bin.location).not.toBe(plan!.location);
    expect(['head', 'centre_torso']).not.toContain(bin.location);
    expect(validateDesign(catalog, plan!.design).valid).toBe(true);
    expect(assessSolvency(catalog, state)).toMatchObject({ state: 'fundable', action: 'finance',
      plan: { requiredCredits: 0, mechId: mech.id, weaponId, mechNeedsWeapon: true } });
    expect(state).toEqual(before);

    expect(fitFromStore(catalog, state, mech, weaponId).ok).toBe(true);
    expect(storeCount(state, 'weapon', weaponId)).toBe(0);
    expect(state.cbills).toBe(before.cbills);
    expect(state.day).toBe(before.day);
    expect(mech.condition.left_leg.internal).toBe(internal);
    const missingArmour = mech.design.armour.centre_torso
      - mech.condition.centre_torso.armour - mech.condition.centre_torso.rearArmour;
    expect(missingArmour).toBeGreaterThanOrEqual(4);
    expect(assessSolvency(catalog, state).state).toBe('fieldable');

    const restored = deserialiseCampaign(serialiseCampaign(state), catalog).state!;
    expect(restored.mechs[0]!.design).toEqual(mech.design);
    expect(restored.mechs[0]!.condition).toEqual(mech.condition);
    expect(acceptContract(catalog, restored, 'militia_raid', 'standard').ok).toBe(true);
    expect(prepareDeployment(catalog, restored).entries[0]?.design).toEqual(mech.design);
  });

  it.each([
    ['rampart_breaker', 'ac20'], ['rivet_escort', 'ac5'], ['trestle_battery', 'ac5'],
  ])('can reinstall %s’s original %s after its last matching ammo is stripped', (designId, weaponId) => {
    const { state, mech } = company(designId);
    const count = mech.design.mounts.length;
    const index = mech.design.mounts.findIndex((mount) => mount.weaponId === weaponId);
    expect(stripToStore(catalog, state, mech, index).ok).toBe(true);
    expect(mech.design.ammo.some((bin) => bin.weaponId === weaponId)).toBe(false);
    expect(fitFromStore(catalog, state, mech, weaponId).ok).toBe(true);
    expect(mech.design.mounts).toHaveLength(count);
    expect(storeCount(state, 'weapon', weaponId)).toBe(0);
    expect(validateDesign(catalog, mech.design).valid).toBe(true);
    expect(state.cbills).toBe(0);
  });

  it('retains existing same-section and shared-bin fits without adding ammunition', () => {
    const { mech } = company('bulwark_assault', true);
    const initial = planFit(catalog, mech.design, 'srm2')!;
    expect(initial.design.ammo).toEqual([{ weaponId: 'srm2', location: initial.location, tons: 1 }]);
    const additional = planFit(catalog, initial.design, 'srm2')!;
    expect(additional.design.ammo).toEqual(initial.design.ammo);
    expect(additional.design.mounts).toHaveLength(2);
    const energy = planFit(catalog, mech.design, 'medium_laser')!;
    expect(energy.design.ammo).toEqual([]);
  });

  it('does not turn an incompatible gun into a valid recovery or consume the crate', () => {
    const { state, mech } = company('wisp_scout', true);
    state.store = [{ kind: 'weapon', itemId: 'ac20', count: 1 }];
    const before = structuredClone(state);
    expect(planFit(catalog, mech.design, 'ac20')).toBeNull();
    expect(fitFromStore(catalog, state, mech, 'ac20').ok).toBe(false);
    expect(state).toEqual(before);
  });
});
