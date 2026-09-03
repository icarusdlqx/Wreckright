import type { Faction } from '../schema/faction';

export interface MachineCultureProfile {
  faction: Faction;
  rightLegLag: number;
  bobScale: number;
  torsoMotionScale: number;
  hydraulicSlop: number;
  idleCorrection: number;
  wholeHullRecoil: number;
  terminalFallSeconds: number;
  revealsFieldDamage: boolean;
  instantTorsoTracking: boolean;
  startupLightStep: number;
}

export interface HullRecoil {
  kick: number;
  travel: number;
  /** Sideways lurch left by a stagger, decaying as the hull finds its feet. */
  jolt: number;
  joltClock: number;
}

const JOLT_RATE = 24;

const LINEWROUGHT: Readonly<MachineCultureProfile> = Object.freeze({
  faction: 'linewrought',
  rightLegLag: 0.11,
  bobScale: 1,
  torsoMotionScale: 1,
  hydraulicSlop: 0.024,
  idleCorrection: 0.014,
  wholeHullRecoil: 1,
  terminalFallSeconds: 0.82,
  revealsFieldDamage: true,
  instantTorsoTracking: false,
  startupLightStep: 0,
});

const AURELIAN: Readonly<MachineCultureProfile> = Object.freeze({
  faction: 'aurelian',
  rightLegLag: 0,
  bobScale: 0,
  torsoMotionScale: 0,
  hydraulicSlop: 0,
  idleCorrection: 0,
  wholeHullRecoil: 0,
  terminalFallSeconds: 0.42,
  revealsFieldDamage: false,
  instantTorsoTracking: true,
  startupLightStep: 0.16,
});

export function machineCulture(faction: Faction): Readonly<MachineCultureProfile> {
  return faction === 'aurelian' ? AURELIAN : LINEWROUGHT;
}

export function legPhaseFor(
  profile: Readonly<MachineCultureProfile>,
  phase: number,
  legIndex: number,
): number {
  return phase + (legIndex === 0 ? 0 : Math.PI + profile.rightLegLag);
}

/** The correction is keyed to the entity so a formation never sways as one object. */
export function idleWeightCorrection(
  profile: Readonly<MachineCultureProfile>,
  elapsed: number,
  entityId: number,
): number {
  if (profile.idleCorrection === 0) return 0;
  return Math.sin(elapsed * 0.83 + entityId * 1.71) * profile.idleCorrection;
}

export function triggerHullRecoil(
  recoil: HullRecoil,
  profile: Readonly<MachineCultureProfile>,
  weaponTravel: number,
): void {
  if (profile.wholeHullRecoil === 0) return;
  recoil.kick = Math.max(
    recoil.kick,
    Math.max(recoil.travel, weaponTravel * 0.5) * profile.wholeHullRecoil,
  );
}

export function triggerStartupShudder(
  recoil: HullRecoil,
  profile: Readonly<MachineCultureProfile>,
): void {
  if (profile.faction !== 'linewrought') return;
  recoil.kick = Math.max(recoil.kick, recoil.travel * 1.8);
}

export function triggerPowerShudder(
  recoil: HullRecoil,
  profile: Readonly<MachineCultureProfile>,
  event: 'shutdown' | 'restart',
): void {
  if (profile.faction !== 'linewrought') return;
  recoil.kick = Math.max(recoil.kick, recoil.travel * (event === 'shutdown' ? 2.4 : 1.8));
}

/** Both cultures lurch when the ground is taken from under them; the sealed hull less. */
export function triggerStaggerJolt(
  recoil: HullRecoil,
  profile: Readonly<MachineCultureProfile>,
): void {
  const reach = recoil.travel * (profile.faction === 'aurelian' ? 4.5 : 7);
  recoil.jolt = Math.max(recoil.jolt, reach);
  recoil.joltClock = 0;
}

export function hullJoltSway(recoil: HullRecoil): number {
  return recoil.jolt === 0 ? 0 : Math.sin(recoil.joltClock * JOLT_RATE) * recoil.jolt;
}

export function hullJoltRoll(recoil: HullRecoil): number {
  return recoil.jolt === 0 ? 0 : Math.sin(recoil.joltClock * JOLT_RATE + 0.6) * recoil.jolt * 0.05;
}

export function advanceHullRecoil(recoil: HullRecoil, deltaSeconds: number): void {
  const delta = Math.max(0, deltaSeconds);
  recoil.kick *= Math.exp(-delta * 10);
  if (recoil.kick < 0.003) recoil.kick = 0;
  recoil.joltClock += delta;
  recoil.jolt *= Math.exp(-delta * 4.2);
  if (recoil.jolt < 0.003) recoil.jolt = 0;
}

export function activeStartupLights(
  profile: Readonly<MachineCultureProfile>,
  elapsed: number,
  total: number,
  reducedMotion: boolean,
): number {
  if (total <= 0) return 0;
  if (reducedMotion || profile.startupLightStep === 0) return total;
  return Math.min(total, Math.floor(Math.max(0, elapsed) / profile.startupLightStep) + 1);
}
