import type { AnimationState } from './locomotionState';
import type { MechModel } from './mechModel';

export function advanceWeightSettle(state: AnimationState, model: MechModel,
  moving: boolean, dt: number, reducedMotion: boolean): void {
  if (dt <= 0) return;
  if (state.wasMoving && !moving) state.weightSettle = Math.max(state.weightSettle, 0.22);
  state.wasMoving = moving;
  if (reducedMotion) state.weightSettle = 0;
  else state.weightSettle *= Math.exp(-Math.max(0, dt) / (model.motion?.settleSeconds ?? 0.25));
  if (state.weightSettle < 0.0001) state.weightSettle = 0;
}

/** Knees absorb the impulse before foot IK solves the terrain; the root never slides away. */
export function applyStanceResponse(state: AnimationState, model: MechModel, reducedMotion: boolean): void {
  model.torso.position.x = 0;
  if (reducedMotion || model.motion === null) return;
  const sealed = model.faction === 'aurelian';
  const kick = Math.max(model.hullRecoil.brace ?? 0, model.hullRecoil.kick);
  const compression = Math.min(0.08, kick / Math.max(1, model.legReach)) * model.motion.braceScale
    + state.weightSettle * (sealed ? 0.025 : 0.07);
  model.torso.position.x = model.hullRecoil.kick === 0 ? 0 : -model.hullRecoil.kick * 0.65;
  model.torso.rotation.z += compression * (sealed ? 0.08 : 0.35);
  for (let index = 0; index < model.legs.length; index += 1) {
    const leg = model.legs[index];
    const pose = state.poses[index];
    if (leg === undefined || pose === undefined || leg.destroyed) continue;
    const support = pose.planted ? 1 : 0.3;
    pose.hip += compression * support * 0.35;
    pose.knee -= compression * support;
    pose.ankle += compression * support * 0.65;
    leg.hip.rotation.z = pose.hip;
    leg.knee.rotation.z = pose.knee;
    leg.ankle.rotation.z = pose.ankle;
  }
  for (const arm of model.articulation.arms) {
    arm.pivot.rotation.z = compression * (sealed ? -0.08 : -0.35);
  }
}
