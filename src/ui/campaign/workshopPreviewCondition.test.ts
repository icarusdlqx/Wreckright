import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { startCampaign } from '../../campaign/campaign';
import { workshopPreviewCondition } from './workshopPreviewCondition';
import { buildPreviewModel, previewModelKey } from '../mechbay/previewModel';

describe('campaign machine inspection', () => {
  it('projects damage without repairing, refitting or mutating the company machine', () => {
    const state = startCampaign(catalog, 'border_dispute', 'inspect-condition');
    const mech = state.mechs[0]!;
    const chassis = catalog.chassis.get(mech.design.chassisId)!;
    const fresh = workshopPreviewCondition(chassis, mech);
    expect([...fresh.lost]).toEqual([]);
    expect(Object.values(fresh.wear).every((tier) => tier === 0)).toBe(true);
    const freshKey = previewModelKey(chassis, mech.design, fresh);
    mech.condition.left_arm.destroyed = true;
    mech.condition.left_arm.armour = 0;
    mech.condition.left_arm.internal = 0;
    mech.condition.centre_torso.armour = 0;
    const before = JSON.stringify(state);
    const worn = workshopPreviewCondition(chassis, mech);
    expect(worn.lost.has('left_arm')).toBe(true);
    expect(worn.wear.left_arm).toBe(2);
    expect(previewModelKey(chassis, mech.design, worn)).not.toBe(freshKey);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('keeps inspection markers out of the showcase and retains normal refit markers', () => {
    const state = startCampaign(catalog, 'aurelian_recall', 'inspect-hulk');
    const mech = state.mechs[0]!;
    const chassis = catalog.chassis.get(mech.design.chassisId)!;
    mech.status = 'hulk';
    const condition = workshopPreviewCondition(chassis, mech);
    const inspection = buildPreviewModel(catalog, chassis, mech.design, condition);
    const refit = buildPreviewModel(catalog, chassis, mech.design);
    try {
      expect(condition.powered).toBe(false);
      expect(inspection.markers).toHaveLength(0);
      expect(refit.markers.length).toBeGreaterThan(0);
      expect(inspection.key).not.toBe(refit.key);
    } finally { inspection.dispose(); refit.dispose(); }
  });
});
