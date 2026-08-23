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

export function createSealedPowerLights(
  plan: Blueprint,
  scale: number,
  failed: ReadonlySet<MechLocation>,
  ownedMaterials: Material[],
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
  const lights: Mesh[] = [];
  const enabled: boolean[] = [];
  const eyeGeometry = new SphereGeometry(scale * 0.052, 8, 6);
  for (let index = 0; index < 3; index += 1) {
    const light = new Mesh(eyeGeometry, material);
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
  }

  const seamGeometry = new BoxGeometry(scale * 0.035, scale * 0.2, scale * 0.2);
  const channels: PowerChannel[] = [];
  for (const location of ['left_arm', 'right_arm'] as const) {
    const part = plan.parts.find((candidate) => candidate.location === location);
    if (part === undefined) continue;
    const seam = new Mesh(seamGeometry, material);
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
  }

  return { lights, enabled, elapsed: 0, running: true };
}
