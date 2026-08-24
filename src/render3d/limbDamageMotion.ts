import type { MechEntity } from '../sim/types';
import { settleFootContact } from './footContact';
import { writeLimpPose, writeStumblePose } from './legMotion';
import type { AnimationState } from './locomotionState';
import { legPhaseFor } from './machineCulture';
import type { MechModel } from './mechModel';

export const LEG_LOSS_STUMBLE_SECONDS = 0.76;
export type SingleLegIndex = -1 | 0 | 1;

export function advanceLegLossStumble(state: AnimationState, deltaSeconds: number): void {
  state.stumbleRemaining = Math.max(0, state.stumbleRemaining - Math.max(0, deltaSeconds));
  if (state.stumbleRemaining === 0) state.stumbleSide = 0;
}

export function triggerLegLossStumble(
  state: AnimationState,
  location: 'left_leg' | 'right_leg',
): void {
  state.stumbleRemaining = LEG_LOSS_STUMBLE_SECONDS;
  state.stumbleSide = location === 'left_leg' ? 1 : -1;
}

export function singleDestroyedLeg(entity: MechEntity, model: MechModel): SingleLegIndex {
  let found: SingleLegIndex = -1;
  for (let index = 0; index < model.legs.length; index += 1) {
    const leg = model.legs[index];
    if (leg === undefined || !entity.locations[leg.location].destroyed) continue;
    if (found !== -1) return -1;
    found = index === 0 ? 0 : 1;
  }
  return found;
}

/** The visible event drives one lurch; persistent damage drives the later limp. */
export function poseLegLossStumble(
  entity: MechEntity,
  model: MechModel,
  state: AnimationState,
  tilt: { x: number; z: number },
  heightAt: (x: number, y: number) => number,
  deltaSeconds: number,
  reducedMotion: boolean,
): boolean {
  const lost = singleDestroyedLeg(entity, model);
  if (state.stumbleRemaining <= 0 || lost < 0) return false;
  const progress = 1 - state.stumbleRemaining / LEG_LOSS_STUMBLE_SECONDS;
  const envelope = Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI);
  const lurch = envelope * (reducedMotion ? 0.055 : 0.2);

  for (let index = 0; index < model.legs.length; index += 1) {
    const leg = model.legs[index];
    const pose = state.poses[index];
    if (leg === undefined || pose === undefined) continue;
    writeStumblePose(pose, index === lost, envelope);
    leg.hip.rotation.z = pose.hip;
    leg.knee.rotation.z = pose.knee;
    leg.ankle.rotation.z = pose.ankle;
  }

  model.root.rotation.x = tilt.x + state.stumbleSide * lurch;
  model.root.rotation.z = tilt.z - envelope * (reducedMotion ? 0.02 : 0.075);
  model.root.position.y -= model.height * envelope * (reducedMotion ? 0.008 : 0.024);
  model.torso.position.y = model.torsoRestY - model.torsoRestY * envelope * 0.035;
  model.torso.rotation.x = -state.stumbleSide * lurch * 0.55;
  model.torso.rotation.z = envelope * (reducedMotion ? 0.015 : 0.055);
  state.amp = 0;
  state.lean = 0;
  settleFootContact(state.contact, model, state.poses, heightAt, deltaSeconds);
  return true;
}

export function applyPersistentLimp(
  model: MechModel,
  lost: SingleLegIndex,
  phase: number,
  amplitude: number,
  reducedMotion: boolean,
): void {
  if (lost < 0) return;
  const leg = model.legs[lost];
  if (leg === undefined) return;
  const side = leg.location === 'left_leg' ? 1 : -1;
  const weight = 0.55 + amplitude * 0.45;
  model.torso.position.y -= model.torsoRestY * 0.025 * weight;
  model.torso.rotation.x += side * (reducedMotion ? 0.045 : 0.075) * weight;
  if (!reducedMotion) model.torso.rotation.z += Math.sin(phase) * 0.035 * amplitude;
}

export function posePersistentLimpLeg(
  model: MechModel,
  state: AnimationState,
  lost: Exclude<SingleLegIndex, -1>,
  posePhase: number,
  swing: number,
  knee: number,
): void {
  const damaged = lost === 0 ? state.poses[0] : state.poses[1];
  const support = state.poses[lost === 0 ? 1 : 0];
  const rig = lost === 0 ? model.legs[0] : model.legs[1];
  if (rig === undefined) return;
  const phase = state.turnDirection === 0
    ? legPhaseFor(model.culture, posePhase, lost)
    : posePhase + (lost === 0 ? 0 : Math.PI);
  writeLimpPose(damaged, phase, swing, knee);
  support.planted = true;
  rig.hip.rotation.z = damaged.hip;
  rig.knee.rotation.z = damaged.knee;
  rig.ankle.rotation.z = damaged.ankle;
}
