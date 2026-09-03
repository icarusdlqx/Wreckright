import {
  BoxGeometry,
  Material,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import type { Blueprint } from '../render/blueprint';
import type { MechLocation } from '../schema/common';
import type { StartupLightRig } from './startupLights';

interface PowerChannel {
  location: MechLocation;
  mesh: Mesh;
}

/**
 * A sealed hull hides its wounds in the shell, so its lamps are what tell the
 * story: a heavily worn channel runs dim and unsteady instead of blacking out.
 */
export function createSealedPowerLights(
  plan: Blueprint,
  scale: number,
  failed: ReadonlySet<MechLocation>,
  ownedMaterials: Material[],
  worn: ReadonlySet<MechLocation> = new Set(),
): StartupLightRig | null {
  const head = plan.parts.find((part) => part.location === 'head');
  if (head === undefined) return null;

  const material = new MeshStandardMaterial({
    color: 0xb9fff2,
    emissive: 0x72e8d7,
    emissiveIntensity: 2.8,
    roughness: 0.22,
  });
  ownedMaterials.push(material);
  const dimmed = worn.size === 0 ? material : material.clone();
  if (dimmed !== material) {
    dimmed.emissiveIntensity = 1.1;
    ownedMaterials.push(dimmed);
  }
  const lights: Mesh[] = [];
  const enabled: boolean[] = [];
  const flicker: boolean[] = [];
  const eyeGeometry = new SphereGeometry(scale * 0.052, 8, 6);
  for (let index = 0; index < 3; index += 1) {
    const light = new Mesh(eyeGeometry, worn.has('head') ? dimmed : material);
    light.name = `startup-light:${index}`;
    light.userData.powerChannel = 'head';
    light.position.set(
      (head.at[0] + head.size[0] * 0.52) * scale,
      head.at[1] * scale,
      (head.at[2] + (index - 1) * head.size[2] * 0.22) * scale,
    );
    light.visible = false;
    lights.push(light);
    enabled.push(!failed.has('head'));
    flicker.push(worn.has('head'));
  }

  const seamGeometry = new BoxGeometry(scale * 0.035, scale * 0.2, scale * 0.2);
  const channels: PowerChannel[] = [];
  for (const location of ['left_arm', 'right_arm'] as const) {
    const part = plan.parts.find((candidate) => candidate.location === location);
    if (part === undefined) continue;
    const seam = new Mesh(seamGeometry, worn.has(location) ? dimmed : material);
    seam.name = `power-seam:${location}`;
    seam.userData.powerChannel = location;
    seam.position.set(
      (part.at[0] + part.size[0] * 0.53) * scale,
      part.at[1] * scale,
      part.at[2] * scale,
    );
    seam.visible = false;
    channels.push({ location, mesh: seam });
  }
  for (const channel of channels) {
    lights.push(channel.mesh);
    enabled.push(!failed.has(channel.location));
    flicker.push(worn.has(channel.location));
  }

  return { lights, enabled, flicker, elapsed: 0, running: true };
}
