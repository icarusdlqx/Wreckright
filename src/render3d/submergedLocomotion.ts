import type { MechEntity } from '../sim/types';
import type { AnimationState } from './locomotionState';
import type { MechModel } from './mechModel';
import type { Interpolated } from './unitViews';
import { waterSubmergenceOffset } from './waterSurface';

export function placeMachineRoot(
  entity: MechEntity,
  model: MechModel,
  state: AnimationState,
  at: Interpolated,
  lift: number,
  terrainId: string,
  deltaSeconds: number,
): number {
  const target = entity.jump === null ? waterSubmergenceOffset(model, terrainId) : 0;
  if (!state.hasSubmergence) {
    state.submergence = target;
    state.hasSubmergence = true;
  } else {
    const elapsed = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    const blend = 1 - Math.exp(-elapsed * 6);
    state.submergence += (target - state.submergence) * blend;
    if (Math.abs(target - state.submergence) < 0.001) state.submergence = target;
  }
  const submergence = state.submergence;
  const contact = entity.jump === null && submergence === 0 ? state.contact.body : 0;
  const kick = model.hullRecoil.kick;
  model.root.position.set(
    at.x - Math.cos(at.facing) * kick,
    state.ground + lift + contact + submergence,
    at.y - Math.sin(at.facing) * kick,
  );
  return submergence;
}

/** Water fixes the hull depth; foot IK must not quietly lift it back onto the surface. */
export function lockSubmergedBody(
  model: MechModel,
  state: AnimationState,
  bodyY: number,
): void {
  model.root.position.y = bodyY;
  state.contact.body = 0;
  state.contact.legs[0] = 0;
  state.contact.legs[1] = 0;
  state.contact.ready = false;
  for (const leg of model.legs) {
    leg.hip.position.set(leg.hipRestX, leg.hipRestY, leg.hipRestZ);
  }
}
