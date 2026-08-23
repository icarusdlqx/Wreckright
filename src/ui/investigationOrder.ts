import type { MechEntity } from '../sim/types';

/** A coarse-area investigation replaces any exact attack intent left from an older contact. */
export function prepareInvestigation(entity: MechEntity): void {
  entity.orders.attack = null;
  entity.targetId = null;
  entity.calledShot = null;
}
