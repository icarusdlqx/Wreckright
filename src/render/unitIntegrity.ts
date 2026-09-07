import { LOCATIONS } from '../schema/common';
import type { MechEntity } from '../sim/types';

/** Combined armour and structure, matching the lance and optical-contact panels. */
export function unitIntegrity(entity: MechEntity): number {
  let current = 0;
  let maximum = 0;
  for (const key of LOCATIONS) {
    const part = entity.locations[key];
    maximum += part.armourMax + part.rearArmourMax + part.internalMax;
    if (!part.destroyed) current += part.armour + part.rearArmour + part.internal;
  }
  return maximum > 0 ? Math.max(0, Math.min(1, current / maximum)) : 0;
}
