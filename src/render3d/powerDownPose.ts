import type { MechModel } from './mechModel';

/** A shutdown must remain readable after its transient light and sound cue is gone. */
export function posePowerDown(
  model: MechModel,
  elapsed: number,
  reducedMotion: boolean,
  tilt: { x: number; z: number },
): void {
  const welded = model.faction === 'linewrought';
  const shudder = welded && !reducedMotion
    ? Math.sin(elapsed * 31) * Math.exp(-elapsed * 4.5) * 0.045
    : 0;
  const knee = welded ? -0.46 : -0.3;
  const hip = welded ? -0.13 : -0.08;
  const ankle = welded ? 0.24 : 0.16;
  for (let index = 0; index < model.legs.length; index += 1) {
    const leg = model.legs[index];
    if (leg === undefined) continue;
    const asymmetry = welded && index === 1 ? 0.07 : 0;
    leg.hip.rotation.z = hip - asymmetry + shudder;
    leg.knee.rotation.z = knee + asymmetry * 0.5;
    leg.ankle.rotation.z = ankle;
  }
  model.torso.position.y = model.torsoRestY - model.height * (welded ? 0.045 : 0.065);
  model.torso.rotation.x = (welded ? -0.075 : -0.04) + shudder * 0.7;
  model.torso.rotation.z = welded ? -0.055 + shudder : 0;
  model.root.rotation.x = tilt.x;
  model.root.rotation.z = tilt.z;
}

/** Non-walking chassis do not pass through the gait writer that normally clears this pose. */
export function restorePoweredPose(
  model: MechModel,
  tilt: { x: number; z: number },
): void {
  for (const leg of model.legs) {
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
