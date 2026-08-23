import type { MechModel } from './mechModel';

export interface TerminalMotionState {
  fall: number;
  landed: boolean;
  destroyed: boolean;
}

/** A newly discovered wreck is already on the ground and emits no impact cue. */
export function settleDestroyed(state: TerminalMotionState): void {
  state.destroyed = true;
  state.fall = 1;
  state.landed = true;
}

export const enum KnockdownPoseResult {
  Continue = 0,
  Block = 1,
  Landed = 2,
  LandedAndBlock = 3,
}

export function poseDestroyed(
  model: MechModel,
  state: TerminalMotionState,
  tilt: { x: number; z: number },
  deltaSeconds: number,
  reducedMotion: boolean,
): boolean {
  // Destruction can arrive while the hull is already on its back. Keeping the
  // existing fall and landing state avoids standing the wreck up for a second
  // fall or firing the ground-impact cue twice.
  state.destroyed = true;
  state.fall = reducedMotion
    ? 1
    : Math.min(1, state.fall + deltaSeconds / model.culture.terminalFallSeconds);
  const eased = 1 - (1 - state.fall) ** 2;
  writeFall(model, tilt, eased, 1.22, Math.min(2.6, Math.max(1.2, model.height * 0.08)));
  if (state.fall < 1 || state.landed) return false;
  state.landed = true;
  return true;
}

export function poseKnockdown(
  model: MechModel,
  state: TerminalMotionState,
  tilt: { x: number; z: number },
  deltaSeconds: number,
  down: boolean,
): KnockdownPoseResult {
  state.destroyed = false;
  state.fall = Math.min(1, Math.max(0, state.fall + deltaSeconds * (down ? 2.2 : -1.8)));
  if (state.fall <= 0) {
    model.root.rotation.x = tilt.x;
    model.root.rotation.z = tilt.z;
    state.landed = false;
    return KnockdownPoseResult.Continue;
  }

  const eased = 1 - (1 - state.fall) ** 2;
  writeFall(model, tilt, eased, 1.1, 1.05);
  let result = down ? KnockdownPoseResult.Block : KnockdownPoseResult.Continue;
  if (down && state.fall >= 1 && !state.landed) {
    state.landed = true;
    result |= KnockdownPoseResult.Landed;
  }
  if (!down) state.landed = false;
  return result;
}

function writeFall(
  model: MechModel,
  tilt: { x: number; z: number },
  eased: number,
  angle: number,
  drop: number,
): void {
  const fallback = model.root.userData.entityId as number | undefined;
  const pitch = model.terminalFallAxis?.pitch ?? ((fallback ?? 0) % 2 === 0 ? 0 : 1);
  const roll = model.terminalFallAxis?.roll ?? ((fallback ?? 0) % 2 === 0 ? -1 : 0);
  model.root.rotation.x = tilt.x + eased * angle * pitch;
  model.root.rotation.z = tilt.z + eased * angle * roll;
  model.root.position.y -= eased * drop;
}
