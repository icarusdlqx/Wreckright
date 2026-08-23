import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { validateDesign } from '../schema/designValidation';
import { armourFacesForDesign } from '../sim/designArmour';
import { startCampaign } from './campaign';
import { stripToStore } from './refit';
import { deserialiseCampaign, serialiseCampaign } from './save';
import { storeCount, type CampaignState, type MechRecord } from './types';

function campaign(): CampaignState {
  return startCampaign(catalog, 'border_dispute', 'quick-strip');
}

function bulwark(state: CampaignState): MechRecord {
  const mech = state.mechs.find((entry) => entry.design.id === 'bulwark_assault');
  if (mech === undefined) throw new Error('missing Bulwark fixture');
  return mech;
}

function mountIndex(mech: MechRecord, weaponId: string): number {
  const index = mech.design.mounts.findIndex((mount) => mount.weaponId === weaponId);
  if (index < 0) throw new Error(`missing ${weaponId} fixture`);
  return index;
}

function missingArmour(mech: MechRecord, location: 'centre_torso'): number {
  const maximum = armourFacesForDesign(
    catalog.rules.construction,
    mech.design,
    location,
  );
  const condition = mech.condition[location];
  return maximum.front + maximum.rear - condition.armour - condition.rearArmour;
}

describe('campaign quick strip', () => {
  it('removes every now-orphaned bin when the final matching weapon leaves', () => {
    const state = campaign();
    const mech = bulwark(state);
    const weaponId = 'ac5';
    const heldBefore = storeCount(state, 'weapon', weaponId);
    mech.condition.centre_torso.armour = Math.max(
      0,
      mech.condition.centre_torso.armour - 6,
    );
    mech.condition.left_arm = {
      armour: 0,
      rearArmour: 0,
      internal: 0,
      destroyed: true,
    };
    const missingBefore = missingArmour(mech, 'centre_torso');

    const result = stripToStore(catalog, state, mech, mountIndex(mech, weaponId));

    expect(result).toEqual({ ok: true, reason: null, location: 'right_torso' });
    expect(mech.design.mounts.some((mount) => mount.weaponId === weaponId)).toBe(false);
    expect(mech.design.ammo.some((bin) => bin.weaponId === weaponId)).toBe(false);
    expect(storeCount(state, 'weapon', weaponId)).toBe(heldBefore + 1);
    expect(validateDesign(catalog, mech.design).valid).toBe(true);
    expect(mech.condition.left_arm.destroyed).toBe(true);
    expect(mech.condition.left_arm.internal).toBe(0);
    expect(missingArmour(mech, 'centre_torso')).toBeGreaterThanOrEqual(missingBefore);

    const restored = deserialiseCampaign(serialiseCampaign(state), catalog).state;
    const restoredMech = restored?.mechs.find((entry) => entry.id === mech.id);
    expect(restoredMech).toBeDefined();
    expect(restoredMech === undefined
      ? false
      : validateDesign(catalog, restoredMech.design).valid).toBe(true);
  });

  it('keeps shared ammunition while another same-pattern mount remains', () => {
    const state = campaign();
    const mech = bulwark(state);
    const weaponId = 'lrm10';
    const ammoBefore = structuredClone(
      mech.design.ammo.filter((bin) => bin.weaponId === weaponId),
    );
    const heldBefore = storeCount(state, 'weapon', weaponId);
    expect(mech.design.mounts.filter((mount) => mount.weaponId === weaponId)).toHaveLength(2);

    const result = stripToStore(catalog, state, mech, mountIndex(mech, weaponId));

    expect(result.ok, result.reason ?? '').toBe(true);
    expect(mech.design.mounts.filter((mount) => mount.weaponId === weaponId)).toHaveLength(1);
    expect(mech.design.ammo.filter((bin) => bin.weaponId === weaponId)).toEqual(ammoBefore);
    expect(storeCount(state, 'weapon', weaponId)).toBe(heldBefore + 1);
    expect(validateDesign(catalog, mech.design).valid).toBe(true);
  });

  it('does not touch stores, design, or condition when the finished design is invalid', () => {
    const state = campaign();
    const mech = bulwark(state);
    mech.design.ammo.push({
      weaponId: 'streak_srm6',
      location: 'head',
      tons: 1,
    });
    const before = structuredClone(state);

    const result = stripToStore(catalog, state, mech, mountIndex(mech, 'medium_laser'));

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('ammo carried but the weapon is not mounted');
    expect(state).toEqual(before);
  });
});
