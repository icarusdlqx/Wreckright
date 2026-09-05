import { Vector3 } from 'three';
import { clamp } from '../sim/math';
import type { MechEntity } from '../sim/types';
import type { BattleEffects } from './battleEffects';
import { resetFootContact } from './footContact';
import { resetLegPose, writeJumpPose } from './legMotion';
import type { MechModel } from './mechModel';
import type { AnimationState } from './locomotionState';
import { responseBlend } from './terrainGait';

const NOZZLE = new Vector3();

export function jumpPose(
  entity: MechEntity,
  model: MechModel,
  state: AnimationState,
  tilt: { x: number; z: number },
  dt: number,
): void {
  const jump = entity.jump;
  const motion = model.motion;
  if (jump === null || motion === null) return;
  const progress = jump.duration <= 0 ? 1 : jump.elapsed / jump.duration;
  state.amp += (0 - state.amp) * responseBlend(motion.response, dt);
  state.lean = 0;
  resetFootContact(state.contact, model);
  for (let index = 0; index < model.legs.length; index += 1) {
    const leg = model.legs[index];
    const pose = state.poses[index];
    if (leg === undefined || pose === undefined) continue;
    writeJumpPose(pose, progress, motion.tuck, index === 0 ? -1 : 1);
    leg.hip.rotation.z = pose.hip;
    leg.knee.rotation.z = pose.knee;
    leg.ankle.rotation.z = pose.ankle;
  }
  model.torso.position.y = model.torsoRestY;
  model.torso.rotation.x = 0;
  model.torso.rotation.z = 0;
  model.root.rotation.x = tilt.x;
  model.root.rotation.z = tilt.z;
}

export function resetMotion(
  state: AnimationState,
  model: MechModel,
  tilt: { x: number; z: number },
): void {
  const previousContact = state.contact.body;
  state.phase = Math.PI / 2;
  state.turnPhase = Math.PI / 2;
  state.turnDirection = 0;
  state.amp = 0;
  state.lean = 0;
  state.lastStep = 0;
  state.contactCue.ready = false;
  resetFootContact(state.contact, model);
  model.root.position.y -= previousContact;
  for (let index = 0; index < model.legs.length; index += 1) {
    const leg = model.legs[index];
    const pose = state.poses[index];
    if (leg === undefined || pose === undefined) continue;
    resetLegPose(pose);
    leg.hip.rotation.z = 0;
    leg.knee.rotation.z = 0;
    leg.ankle.rotation.z = 0;
  }
  model.torso.position.y = model.torsoRestY;
  model.torso.rotation.x = 0;
  model.torso.rotation.z = 0;
  model.root.rotation.x = tilt.x;
  model.root.rotation.z = tilt.z;
}

export function burnJumpJets(entity: MechEntity, model: MechModel, effects: BattleEffects): void {
  const jump = entity.jump;
  if (jump === null || entity.destroyed || entity.shutdownRemaining > 0) return;
  const progress = jump.duration <= 0 ? 1 : jump.elapsed / jump.duration;
  const throttle = clamp(
    Math.max(0, 1 - progress * 2.4) + Math.max(0, (progress - 0.7) / 0.3) * 0.8,
    0,
    1,
  );
  if (throttle <= 0.02) return;

  if (!model.services.enabled) return;
  for (let index = 0; index < model.services.jets.length; index += 1) {
    model.services.jets[index]!.getWorldPosition(NOZZLE);
    effects.plume(entity.id * 2 + index, NOZZLE, throttle);
  }
}
