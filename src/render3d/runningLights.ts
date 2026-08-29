import {
  BoxGeometry,
  Material,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import type { Blueprint } from '../render/blueprint';
import type { MechLocation } from '../schema/common';
import type { Faction } from '../schema/faction';
import { createSealedPowerLights } from './sealedPowerLights';
import type { StartupLightRig } from './startupLights';

const RUNNING_LIGHT_LOCATIONS = ['head', 'left_torso', 'right_torso'] as const;

export function createMachinePowerLights(
  faction: Faction,
  night: boolean,
  plan: Blueprint,
  scale: number,
  sealedFailures: ReadonlySet<MechLocation>,
  runningFailures: ReadonlySet<MechLocation>,
  ownedMaterials: Material[],
): StartupLightRig | null {
  if (faction === 'aurelian') {
    return createSealedPowerLights(plan, scale, sealedFailures, ownedMaterials);
  }
  return night
    ? createLinewroughtRunningLights(plan, scale, runningFailures, ownedMaterials)
    : null;
}

/** A fixed lamp count keeps night readability independent of chassis complexity. */
export function createLinewroughtRunningLights(
  plan: Blueprint,
  scale: number,
  failed: ReadonlySet<MechLocation>,
  ownedMaterials: Material[],
): StartupLightRig | null {
  const material = new MeshStandardMaterial({
    color: 0xffd7a3,
    emissive: 0xff8a3d,
    emissiveIntensity: 2.4,
    roughness: 0.3,
  });
  const geometry = new BoxGeometry(scale * 0.055, scale * 0.045, scale * 0.075);
  const lights: Mesh[] = [];
  const enabled: boolean[] = [];

  for (const location of RUNNING_LIGHT_LOCATIONS) {
    const part = plan.parts.find((candidate) => candidate.location === location);
    if (part === undefined) continue;
    const light = new Mesh(geometry, material);
    light.name = `running-light:${location}`;
    light.userData.powerChannel = location;
    light.position.set(
      (part.at[0] + part.size[0] * 0.53) * scale,
      (part.at[1] + part.size[1] * 0.12) * scale,
      part.at[2] * scale,
    );
    light.visible = false;
    lights.push(light);
    enabled.push(!failed.has(location));
  }

  if (lights.length === 0) {
    geometry.dispose();
    material.dispose();
    return null;
  }
  ownedMaterials.push(material);
  return { lights, enabled, elapsed: 0, running: true };
}
