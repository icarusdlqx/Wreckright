import { radiusFor } from '../render/shape';
import { angleDifference, clamp } from '../sim/math';
import type { EntityId, MechEntity, Vec2 } from '../sim/types';
import type { BattleEffects } from './battleEffects';
import { settleFootContact } from './footContact';
import { resetLegPose, writeStridePose, writeTurnPose } from './legMotion';
import {
  advanceLegLossStumble,
  applyPersistentLimp,
  poseLegLossStumble,
  posePersistentLimpLeg,
  singleDestroyedLeg,
  triggerLegLossStumble,
} from './limbDamageMotion';
import type { MechModel } from './mechModel';
import { strideLengthFor, strideSwing, turnStrideLength } from './motionProfiles';
import {
  advanceGait,
  gaitForTerrain,
  responseBlend,
} from './terrainGait';
import type { Interpolated } from './unitViews';
import { idleWeightCorrection, legPhaseFor } from './machineCulture';
import { localTilt, sampleGround, type GroundSample } from './locomotionGround';
import { poseLoosePanels } from './damagedPanels';
import { poseMachineMotion } from './machineMotion';
import { posePowerDown, restorePoweredPose } from './powerDownPose';
import {
  KnockdownPoseResult,
  poseDestroyed,
  poseKnockdown,
  settleDestroyed,
} from './terminalMotion';
import { createAnimationState, type AnimationState } from './locomotionState';
import { lockSubmergedBody, placeMachineRoot } from './submergedLocomotion';
import { burnJumpJets, jumpPose, resetMotion } from './locomotionJump';
import { emitFootContacts, type FootfallCallback } from './locomotionContact';
import { advanceWeightSettle, applyStanceResponse } from './stanceResponse';
import { resetModelArticulation } from './modelArticulation';
import { updateMachineHeat } from './machineServices';
import { supportTerminalOnGround } from './terminalSupport';

export { advanceGait, gaitForTerrain, responseBlend, type GaitProfile } from './terrainGait';
export { localTilt, sampleGround, type GroundSample } from './locomotionGround';

const OPEN_KNEE = 0.5;

/** Render-only gait and ground pose; simulation positions remain authoritative. */
export class Locomotion {
  onFootfall: FootfallCallback | null = null;

  private readonly states = new Map<EntityId, AnimationState>();
  private readonly terminalFallAuthorizations = new Set<EntityId>();

  constructor(
    private readonly heightAt: (x: number, y: number) => number,
    private readonly terrainAt: (at: Vec2) => string,
    private readonly effects: BattleEffects,
    private readonly reducedMotion = false,
  ) {}

  beginFrame(deltaSeconds: number): void {
    for (const state of this.states.values()) advanceLegLossStumble(state, deltaSeconds);
  }

  triggerLegLoss(id: EntityId, location: 'left_leg' | 'right_leg'): void {
    triggerLegLossStumble(this.stateFor(id), location);
  }

  authorizeTerminalFall(id: EntityId): void {
    this.terminalFallAuthorizations.add(id);
  }

  settleTerminal(id: EntityId): void {
    this.terminalFallAuthorizations.delete(id);
    settleDestroyed(this.stateFor(id).terminal);
  }

  retire(id: EntityId): void {
    this.states.delete(id);
    this.terminalFallAuthorizations.delete(id);
  }

  place(
    entity: MechEntity,
    model: MechModel,
    at: Interpolated,
    lift: number,
    deltaSeconds: number,
  ): number {
    const state = this.stateFor(entity.id);
    if (entity.destroyed && !this.terminalFallAuthorizations.has(entity.id)) {
      settleDestroyed(state.terminal);
    }
    const footprint = clamp(radiusFor(entity.tonnage) * 0.78, 8, 20);
    const ground = sampleGround(this.heightAt, at, footprint);
    this.followGround(state, ground, deltaSeconds);
    const tilt = localTilt(state.gradeX, state.gradeY, at.facing);
    const terrainId = this.terrainAt(at);
    const submergence = placeMachineRoot(
      entity, model, state, at, lift, terrainId, deltaSeconds,
    );
    model.root.rotation.y = -at.facing;
    model.root.rotation.x = tilt.x;
    model.root.rotation.z = tilt.z;
    model.torso.rotation.y = -at.torso;
    model.torso.position.x = 0;
    resetModelArticulation(model.articulation);
    updateMachineHeat(model.services, entity.heat / Math.max(1, entity.heatCapacity),
      !entity.destroyed && entity.shutdownRemaining <= 0);

    this.animate(entity, model, at, deltaSeconds, tilt, terrainId);
    if (state.terminal.fall > 0) supportTerminalOnGround(model, state.terminal.fall, this.heightAt, submergence);
    if (submergence !== 0 && state.terminal.fall <= 0) {
      lockSubmergedBody(model, state, state.ground + lift + submergence);
    }
    poseMachineMotion(model.machineMotion);
    if (entity.jump !== null) burnJumpJets(entity, model, this.effects);
    return submergence;
  }

  private followGround(state: AnimationState, target: GroundSample, dt: number): void {
    if (!state.hasGround) {
      state.ground = target.height;
      state.gradeX = target.gradeX;
      state.gradeY = target.gradeY;
      state.hasGround = true;
      return;
    }
    const slopeBlend = responseBlend(9, dt);
    state.ground = target.height;
    state.gradeX += (target.gradeX - state.gradeX) * slopeBlend;
    state.gradeY += (target.gradeY - state.gradeY) * slopeBlend;
  }

  private animate(
    entity: MechEntity,
    model: MechModel,
    at: Interpolated,
    dt: number,
    tilt: { x: number; z: number },
    terrainId: string,
  ): void {
    const state = this.stateFor(entity.id);
    state.elapsed += Math.max(0, dt);
    poseLoosePanels(model.loosePanels, state.elapsed, state.amp, this.reducedMotion);

    if (entity.destroyed) {
      if (poseDestroyed(model, state.terminal, tilt, dt, this.reducedMotion)) {
        this.effects.land({ x: at.x, y: at.y }, 0x8a8a82, 2.5);
      }
      return;
    }

    const down = entity.downRemaining > 0;
    const knockdown = poseKnockdown(model, state.terminal, tilt, dt, down);
    if ((knockdown & KnockdownPoseResult.Landed) !== 0) {
      this.effects.land({ x: at.x, y: at.y }, 0x8a8a82, 1.8);
    }
    if ((knockdown & KnockdownPoseResult.Block) !== 0) return;

    if (entity.shutdownRemaining > 0) {
      state.shutdownElapsed += Math.max(0, dt);
      posePowerDown(model, state.shutdownElapsed, this.reducedMotion, tilt);
      state.lastX = at.x;
      state.lastY = at.y;
      state.lastFacing = at.facing;
      state.hasLast = true;
      return;
    }
    state.shutdownElapsed = 0;

    const translated = state.hasLast ? Math.hypot(at.x - state.lastX, at.y - state.lastY) : 0;
    const turnDelta = state.hasLast ? angleDifference(state.lastFacing, at.facing) : 0;
    const turned = Math.abs(turnDelta);
    state.lastX = at.x;
    state.lastY = at.y;
    state.lastFacing = at.facing;
    state.hasLast = true;

    if (poseLegLossStumble(entity, model, state, tilt, this.heightAt, dt, this.reducedMotion)) return;

    const motion = model.motion;
    if (model.legs.length === 0 || motion === null) {
      restorePoweredPose(model, tilt);
      return;
    }

    advanceGait(state.gait, gaitForTerrain(terrainId), dt);
    const profile = state.gait;
    const grade = Math.hypot(state.gradeX, state.gradeY);
    const climb = clamp(grade / 0.45, 0, 1);
    const lostLeg = singleDestroyedLeg(entity, model);
    const strideLength = strideLengthFor(model.legReach, motion, profile)
      * (1 - climb * 0.18) * (lostLeg < 0 ? 1 : 0.72);

    if (entity.jump !== null) {
      state.wasJumping = true;
      jumpPose(entity, model, state, tilt, dt);
      return;
    }

    if (state.wasJumping) {
      state.wasJumping = false;
      resetMotion(state, model, tilt);
      state.weightSettle = this.reducedMotion ? 0 : 1;
      applyStanceResponse(state, model, this.reducedMotion);
      settleFootContact(state.contact, model, state.poses, this.heightAt, dt);
      emitFootContacts(entity, model, state, this.terrainAt, this.heightAt, this.onFootfall, false, true);
      return;
    }

    if (translated > Math.max(2, model.strideLength * 2) || turned > Math.PI * 0.45) {
      resetMotion(state, model, tilt);
      return;
    }

    const turnTravel = turnDelta * model.turnRadius;
    const travelled = Math.hypot(translated, turnTravel);
    advanceWeightSettle(state, model, travelled > 0, dt, this.reducedMotion);
    const pureTurn = turned > 0 && translated <= Math.abs(turnTravel) * 0.25;
    let posePhase: number;
    let poseStride = strideLength;
    if (pureTurn) {
      const direction: -1 | 1 = turnDelta < 0 ? -1 : 1;
      if (state.turnDirection !== direction) state.turnPhase = Math.PI / 2;
      state.turnDirection = direction;
      poseStride = turnStrideLength(strideLength, model.turnRadius);
      state.turnPhase += (Math.abs(turnTravel) / poseStride) * Math.PI;
      posePhase = state.turnPhase;
    } else if (translated > 0) {
      if (state.turnDirection !== 0) state.phase = Math.PI / 2;
      state.turnDirection = 0;
      state.phase += (travelled / strideLength) * Math.PI;
      posePhase = state.phase;
    } else {
      posePhase = state.turnDirection === 0 ? state.phase : state.turnPhase;
    }

    if (model.faction === 'aurelian' && translated === 0 && turned === 0 && lostLeg < 0) {
      state.amp = 0;
      state.lean = 0;
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
      applyStanceResponse(state, model, this.reducedMotion);
      settleFootContact(state.contact, model, state.poses, this.heightAt, dt);
      emitFootContacts(entity, model, state, this.terrainAt, this.heightAt, this.onFootfall, false);
      return;
    }

    const speed = dt > 0 ? travelled / dt : 0;
    const wantedAmp = clamp(speed / 3.5, 0, 1);
    const acceleration = wantedAmp - state.amp;
    const wantedLean = -clamp(acceleration * 2.4, -1, 1) * motion.lean;
    state.amp += acceleration * responseBlend(motion.response, dt);
    state.lean += (wantedLean - state.lean) * responseBlend(motion.response * 0.72, dt);

    const swing = strideSwing(poseStride, model.legReach);
    const knee = motion.kneeLift * (profile.knee / OPEN_KNEE) * (1 + climb * 0.25) * state.amp;
    for (let index = 0; index < model.legs.length; index += 1) {
      const leg = model.legs[index];
      const pose = state.poses[index];
      if (leg === undefined || pose === undefined) continue;
      const phase = state.turnDirection === 0
        ? legPhaseFor(model.culture, posePhase, index)
        : posePhase + (index === 0 ? 0 : Math.PI);
      if (state.turnDirection === 0) writeStridePose(pose, phase, swing, knee, 0);
      else writeTurnPose(pose, phase, swing, knee, index === 0 ? -1 : 1, state.turnDirection);
      leg.hip.rotation.z = pose.hip;
      leg.knee.rotation.z = pose.knee;
      leg.ankle.rotation.z = pose.ankle;
    }
    if (lostLeg === 0 || lostLeg === 1) {
      posePersistentLimpLeg(model, state, lostLeg, posePhase, swing, knee);
    }

    const bob = motion.bob * profile.bob * (1 - climb * 0.35) * model.culture.bobScale;
    const idleCorrection = this.reducedMotion || travelled !== 0 || turned !== 0
      ? 0
      : idleWeightCorrection(model.culture, state.elapsed, entity.id);
    model.torso.position.y =
      model.torsoRestY +
      Math.abs(Math.sin(posePhase)) * model.torsoRestY * 0.035 * state.amp * bob +
      Math.abs(idleCorrection) * model.torsoRestY * 0.12;
    model.torso.rotation.x =
      Math.sin(posePhase) * 0.018 * state.amp * bob + idleCorrection * 0.45;
    model.torso.rotation.z =
      (state.lean - Math.sin(posePhase) * motion.torsoCounter * state.amp) *
      model.culture.torsoMotionScale +
      Math.sin(posePhase - 0.22) * model.culture.hydraulicSlop * state.amp +
      idleCorrection;
    applyPersistentLimp(model, lostLeg, posePhase, state.amp, this.reducedMotion);
    model.root.rotation.x = tilt.x;
    model.root.rotation.z = tilt.z;
    applyStanceResponse(state, model, this.reducedMotion);
    settleFootContact(
      state.contact,
      model,
      state.poses,
      this.heightAt,
      dt,
    );

    emitFootContacts(entity, model, state, this.terrainAt, this.heightAt, this.onFootfall, travelled > 0);
  }

  private stateFor(id: EntityId): AnimationState {
    const existing = this.states.get(id);
    if (existing !== undefined) return existing;
    const fresh = createAnimationState();
    this.states.set(id, fresh);
    return fresh;
  }
}
