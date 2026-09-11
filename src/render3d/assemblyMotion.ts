import type { ModelArticulation } from './modelArticulation';
import type { Faction } from '../schema/faction';

/** Small inertial follow-through leaves the weapon's aim readable and the legs authoritative. */
export function poseTravellingAssemblies(
  rig: ModelArticulation,
  faction: Faction,
  phase: number,
  amplitude: number,
  firing: boolean,
  reducedMotion: boolean,
): void {
  if (reducedMotion || amplitude <= 0) return;
  const restrained = faction === 'aurelian';
  const follow = amplitude * (firing ? 0.15 : 1);
  for (const arm of rig.arms) {
    const side = arm.location === 'left_arm' ? -1 : 1;
    arm.pivot.rotation.z += Math.sin(phase + side * Math.PI / 2 - 0.3)
      * follow * (restrained ? 0.019 : 0.07);
    arm.pivot.rotation.x += side * Math.sin(phase * 2 - 0.22)
      * follow * (restrained ? 0.006 : 0.017);
  }
  for (const shoulder of rig.shoulders) {
    const side = shoulder.location === 'left_torso' ? -1 : 1;
    shoulder.pivot.rotation.z += Math.sin(phase - side * 0.2)
      * follow * (restrained ? 0.004 : 0.012);
  }
}
