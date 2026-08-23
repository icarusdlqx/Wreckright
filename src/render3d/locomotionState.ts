import { createFootContactState, type FootContactState } from './footContact';
import type { LegPose } from './legMotion';
import { gaitForTerrain, type GaitProfile } from './terrainGait';
import type { TerminalMotionState } from './terminalMotion';

export interface AnimationState {
  phase: number;
  amp: number;
  lean: number;
  lastX: number;
  lastY: number;
  lastFacing: number;
  hasLast: boolean;
  lastStep: number;
  ground: number;
  gradeX: number;
  gradeY: number;
  hasGround: boolean;
  gait: GaitProfile;
  wasJumping: boolean;
  poses: [LegPose, LegPose];
  contact: FootContactState;
  turnPhase: number;
  turnDirection: -1 | 0 | 1;
  elapsed: number;
  shutdownElapsed: number;
  terminal: TerminalMotionState;
}

export function createAnimationState(): AnimationState {
  return {
    phase: Math.PI / 2,
    amp: 0,
    lean: 0,
    lastX: 0,
    lastY: 0,
    lastFacing: 0,
    hasLast: false,
    lastStep: 0,
    ground: 0,
    gradeX: 0,
    gradeY: 0,
    hasGround: false,
    gait: { ...gaitForTerrain('open') },
    wasJumping: false,
    poses: [
      { hip: 0, knee: 0, ankle: 0, planted: true },
      { hip: 0, knee: 0, ankle: 0, planted: true },
    ],
    contact: createFootContactState(),
    turnPhase: Math.PI / 2,
    turnDirection: 0,
    elapsed: 0,
    shutdownElapsed: 0,
    terminal: { fall: 0, landed: false, destroyed: false },
  };
}
