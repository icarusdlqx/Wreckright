import type { MechRecord } from '../../campaign/types';
import { damageWearTier } from '../../render3d/damageLedger';
import type { Chassis } from '../../schema/chassis';
import { LOCATIONS } from '../../schema/common';
import type { PreviewCondition } from '../mechbay/previewModel';

/** Read-only campaign damage follows the same visual wear thresholds as a battlefield machine. */
export function workshopPreviewCondition(chassis: Chassis, mech: MechRecord): PreviewCondition {
  return {
    lost: new Set(LOCATIONS.filter((location) => mech.condition[location].destroyed)),
    wear: Object.fromEntries(LOCATIONS.map((location) => [location, damageWearTier({
      ...mech.condition[location],
      armourMax: mech.design.armour[location], rearArmourMax: 0,
      internalMax: chassis.internals[location], hasRearArmourFace: false,
    })])),
    powered: mech.status !== 'hulk',
    showMarkers: false,
  };
}
