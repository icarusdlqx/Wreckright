import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { validateDesign } from '../schema/designValidation';
import { startCampaign } from './campaign';
import { applyRefit, stripToStore } from './refit';
import { pristineCondition } from './repair';
import { deserialiseCampaign, serialiseCampaign } from './save';
import { storeCount, type MechRecord } from './types';

describe('cross-faction recovered weapon reuse', () => {
  it.each([
    ['bulwark_assault', 'large_laser'],
    ['sentinel_brawler', 'ac5'],
  ])('moves %s weapon %s through stores and back without a hidden adapter or faction penalty', (designId, weaponId) => {
    const design = catalog.designs.get(designId);
    if (design === undefined) throw new Error(`missing ${designId}`);
    const original = structuredClone(design);
    const state = startCampaign(catalog, 'border_dispute', `cross-fit-${designId}`);
    const mech: MechRecord = {
      id: 'cross-faction-test', design: structuredClone(design),
      condition: pristineCondition(catalog, design), status: 'ready', readyOnDay: 0, rebuildCost: 0,
    };
    state.mechs = [mech];
    for (const pilot of state.pilots) pilot.mechId = null;
    state.store = [];
    const chassisFaction = catalog.chassis.get(design.chassisId)?.faction;
    expect(catalog.weapons.get(weaponId)?.faction).not.toBe(chassisFaction);
    const mountIndex = mech.design.mounts.findIndex((mount) => mount.weaponId === weaponId);
    expect(stripToStore(catalog, state, mech, mountIndex).ok).toBe(true);
    expect(storeCount(state, 'weapon', weaponId)).toBe(1);
    expect(applyRefit(catalog, state, mech, original).ok).toBe(true);
    expect(storeCount(state, 'weapon', weaponId)).toBe(0);
    expect(mech.design).toEqual(original);
    expect(validateDesign(catalog, mech.design).valid).toBe(true);
    const restored = deserialiseCampaign(serialiseCampaign(state), catalog);
    expect(restored.state?.mechs[0]?.design).toEqual(original);
    expect(restored.state?.store).toEqual([]);
  });
});
