import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { armourFacesForDesign } from '../sim/designArmour';
import { startCampaign } from './campaign';
import { applyRefit } from './refit';
import { pristineCondition } from './repair';
import { deserialiseCampaign, serialiseCampaign } from './save';

const CAMPAIGN_ID = 'border_dispute';

describe('campaign armour persistence', () => {
  it('round-trips exact rear allocation without adding it to legacy designs', () => {
    const state = startCampaign(catalog, CAMPAIGN_ID, 'rear-armour-save');
    const legacyMech = state.mechs[0];
    if (legacyMech === undefined) throw new Error('campaign has no mech');
    expect(legacyMech.design.rearArmour).toBeUndefined();
    const legacy = deserialiseCampaign(serialiseCampaign(state)).state;
    expect(legacy?.mechs[0]?.design.rearArmour).toBeUndefined();

    legacyMech.design.rearArmour = {
      centre_torso: 4,
      left_torso: 3,
      right_torso: 2,
    };
    const restored = deserialiseCampaign(serialiseCampaign(state)).state;
    expect(restored?.mechs[0]?.design.rearArmour).toEqual(legacyMech.design.rearArmour);
  });

  it('preserves missing torso plate when a refit redistributes front and rear', () => {
    const state = startCampaign(catalog, CAMPAIGN_ID, 'rear-armour-refit');
    const mech = state.mechs[0];
    if (mech === undefined) throw new Error('campaign has no mech');
    const location = 'centre_torso' as const;
    const beforeMax = armourFacesForDesign(catalog.rules.construction, mech.design, location);
    mech.condition[location].armour = Math.max(0, beforeMax.front - 7);
    mech.condition[location].rearArmour = Math.max(0, beforeMax.rear - 3);
    const missingBefore = beforeMax.front + beforeMax.rear
      - mech.condition[location].armour - mech.condition[location].rearArmour;

    const next = structuredClone(mech.design);
    next.rearArmour = {
      centre_torso: Math.floor(next.armour.centre_torso / 2),
      left_torso: Math.floor(next.armour.left_torso / 2),
      right_torso: Math.floor(next.armour.right_torso / 2),
    };
    const result = applyRefit(catalog, state, mech, next);

    expect(result.ok, result.reason ?? '').toBe(true);
    const afterMax = armourFacesForDesign(catalog.rules.construction, mech.design, location);
    const missingAfter = afterMax.front + afterMax.rear
      - mech.condition[location].armour - mech.condition[location].rearArmour;
    expect(missingAfter).toBe(missingBefore);
    expect(mech.condition[location].rearArmour).toBeLessThanOrEqual(afterMax.rear);
    expect(mech.condition[location].armour).toBeLessThanOrEqual(afterMax.front);
    const repaired = pristineCondition(catalog, next);
    expect(repaired.centre_torso.rearArmour).toBe(next.rearArmour.centre_torso);
    expect(repaired.left_torso.rearArmour).toBe(next.rearArmour.left_torso);
    expect(repaired.right_torso.rearArmour).toBe(next.rearArmour.right_torso);
  });
});
