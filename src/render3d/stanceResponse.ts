import type { AnimationState } from './locomotionState';
import type { MechModel } from './mechModel';
import { applyHitResponse } from './hitResponse';

export function advanceWeightSettle(state: AnimationState, model: MechModel,
  moving: boolean, dt: number, reducedMotion: boolean): void {
  if (dt <= 0) return;
  if (state.wasMoving && !moving) state.weightSettle = Math.max(state.weightSettle, 0.34);
  state.wasMoving = moving;
  if (reducedMotion) state.weightSettle = 0;
  else state.weightSettle *= Math.exp(-Math.max(0, dt) / (model.motion?.settleSeconds ?? 0.25));
  if (state.weightSettle < 0.0001) state.weightSettle = 0;
}

/** Lateral weight follows the actual turn; there is no independent chassis drift. */
export function advanceTurnBalance(state: AnimationState, model: MechModel,
  turnDelta: number, dt: number, reducedMotion: boolean): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const target = reducedMotion ? 0 : Math.max(-1, Math.min(1, turnDelta / dt));
  state.turnBalance += (target - state.turnBalance) * (1 - Math.exp(-dt * (model.motion?.response ?? 8)));
  if (Math.abs(state.turnBalance) < 0.0001 || reducedMotion) state.turnBalance = 0;
}

/** Knees absorb the impulse before foot IK solves the terrain; the root never slides away. */
export function applyStanceResponse(state: AnimationState, model: MechModel, reducedMotion: boolean): void {
  model.torso.position.x = 0;
  model.torso.position.z = 0;
  if (reducedMotion || model.motion === null) return;
  const sealed = model.faction === 'aurelian';
  const kick = Math.max(model.hullRecoil.brace ?? 0, model.hullRecoil.kick);
  const compression = Math.min(0.1, kick * 2 / Math.max(1, model.legReach)) * model.motion.braceScale
    + state.weightSettle * (sealed ? 0.025 : 0.07);
  model.torso.position.x = model.hullRecoil.kick === 0 ? 0 : -model.hullRecoil.kick;
  if (!sealed) {
    model.torso.position.y -= model.legReach * (state.weightSettle * 0.04 + compression * 0.08);
    model.torso.position.z = state.turnBalance * model.legReach * 0.025;
    model.torso.rotation.x += state.turnBalance * 0.065;
  }
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
    if (!sealed) arm.pivot.rotation.x -= state.turnBalance * 0.055;
  }
  applyHitResponse(model);
}
