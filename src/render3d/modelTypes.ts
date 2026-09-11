import type { Group, Object3D } from 'three';
import type { Faction } from '../schema/faction';
import type { DamageWearTier } from './damageLedger';
import type { MotionProfile } from './motionProfiles';
import type { WeaponRig } from './weaponModels';
import type { HullRecoil, MachineCultureProfile } from './machineCulture';
import type { StartupLightRig } from './startupLights';
import type { LoosePanelRig } from './damagedPanels';
import type { MachineMotionRig } from './machineMotion';
import type { TerminalFallAxis } from './unitVisualState';
import type { ModelArticulation } from './modelArticulation';
import type { MachineServices } from './machineServices';
import type { TerminalSupportRig } from './terminalSupport';

/** Three pivots keep the boot planted without adding another visible part. */
export interface LegRig {
  hip: Group;
  knee: Group;
  ankle: Group;
  hipRestX: number;
  hipRestY: number;
  hipRestZ: number;
  location: 'left_leg' | 'right_leg';
  damageTier: DamageWearTier;
  destroyed: boolean;
  /** Centre of the lowest visible sole, attached below the ankle frame. */
  sole: Object3D;
}

export interface Footprint {
  minForward: number;
  maxForward: number;
  halfWidth: number;
}

export interface MechModel {
  root: Group;
  /** Turns with the torso; the legs stay with the hull. */
  torso: Group;
  /** Metres from the ground to the top of the hull, for HUD markers. */
  height: number;
  /** Left and right legs, hung from real pivots so the mech can walk. */
  legs: LegRig[];
  /** Where the torso rests, so a walk bob has a base to come back to. */
  torsoRestY: number;
  /** One full stride, in world metres, for pacing the walk cycle. */
  strideLength: number;
  /** The articulated chain's comfortable reach in world metres. */
  legReach: number;
  /** An ankle sits above the ground even when its boot is flat. */
  ankleClearance: number;
  /** Sole bounds let contact sample the ground the visible boot actually covers. */
  footprint: Footprint;
  /** Hull yaw at this radius has to show up in the feet. */
  turnRadius: number;
  /** Presentation weight belongs to the chassis, never the movement rules. */
  motion: MotionProfile | null;
  /** Authored mounts keep their own muzzle and recoil travel after construction. */
  weapons: WeaponRig[];
  machineMotion: MachineMotionRig;
  faction: Faction;
  culture: Readonly<MachineCultureProfile>;
  hullRecoil: HullRecoil;
  startup: StartupLightRig | null;
  loosePanels: LoosePanelRig[];
  terminalFallAxis: TerminalFallAxis | null;
  articulation: ModelArticulation;
  services: MachineServices;
  terminalSupport: TerminalSupportRig;
}

