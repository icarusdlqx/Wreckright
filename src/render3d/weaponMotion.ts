import { Mesh, MeshStandardMaterial, type Group, type Object3D } from 'three';
import type { Weapon } from '../schema/weapon';
import type { Faction } from '../schema/faction';
import type { WeaponBuildParts, WeaponRig } from './weaponModelTypes';

export function createWeaponRig(
  weaponId: string,
  nativeFaction: Faction,
  visual: Weapon['visual'],
  slide: Group,
  muzzle: Object3D,
  breech: Object3D,
  travel: number,
  parts: WeaponBuildParts,
  powered = true,
): WeaponRig {
  const powerMaterials: { material: MeshStandardMaterial; intensity: number }[] = [];
  const seen = new Set<MeshStandardMaterial>();
  slide.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial) || seen.has(material)
        || material.emissive.getHex() === 0 || material.emissiveIntensity <= 0) continue;
      seen.add(material);
      powerMaterials.push({ material, intensity: material.emissiveIntensity });
      if (!powered) {
        material.emissiveIntensity = 0;
        material.color.multiplyScalar(0.12);
        material.roughness = 0.85;
      }
    }
  });
  return {
    weaponId,
    nativeFaction,
    visual,
    slide,
    muzzle,
    breech,
    powered,
    kick: 0,
    travel,
    cycle: 0,
    freshCycle: false,
    feed: parts.feed ?? null,
    feedKind: parts.feedKind ?? 'stroke',
    feedRestX: parts.feed?.position.x ?? 0,
    feedRestTurn: parts.feed?.rotation.x ?? 0,
    feedTurn: 0,
    powerMaterials,
    feedTravel: parts.feedTravel ?? 0,
    aperture: parts.aperture ?? null,
    apertureRestScale: parts.aperture?.scale.y ?? 1,
    apertureTravel: parts.apertureTravel ?? 0,
  };
}

export function triggerWeaponMotion(rig: WeaponRig): void {
  if (rig.nativeFaction === 'linewrought') {
    rig.kick = Math.max(rig.kick, rig.travel);
  }
  rig.cycle = 1;
  rig.freshCycle = true;
  applyWeaponMotion(rig);
}

/** Every moving piece already exists; sustained fire only changes scalar transforms. */
export function advanceWeaponMotion(
  rig: WeaponRig,
  deltaSeconds: number,
  reducedMotion = false,
  lowFx = false,
): void {
  const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
  if (rig.freshCycle) {
    rig.freshCycle = false;
    applyWeaponMotion(rig);
    return;
  }
  rig.kick *= Math.exp(-delta * 13);
  const previousCycle = rig.cycle;
  rig.cycle *= Math.exp(-delta * (lowFx ? 24 : reducedMotion ? 18 : 9));
  if (rig.feedKind === 'spin' && !reducedMotion) {
    rig.feedTurn += rig.feedTravel * (previousCycle - rig.cycle);
    if (rig.feedTurn > Math.PI * 200) rig.feedTurn %= Math.PI * 2;
  }
  if (rig.kick < 0.005) rig.kick = 0;
  if (rig.cycle < 0.002) rig.cycle = 0;
  applyWeaponMotion(rig);
}

function applyWeaponMotion(rig: WeaponRig): void {
  rig.slide.position.x = rig.nativeFaction === 'linewrought' && rig.kick !== 0 ? -rig.kick : 0;
  const cycle = rig.cycle;
  if (rig.feed !== null && rig.feedKind === 'spin') {
    rig.feed.rotation.x = rig.feedRestTurn + rig.feedTurn;
  } else if (rig.feed !== null) {
    rig.feed.position.x = rig.feedRestX - rig.feedTravel * cycle;
  }
  for (const channel of rig.powerMaterials) {
    channel.material.emissiveIntensity = rig.powered ? channel.intensity * (1 + cycle * 1.8) : 0;
  }
  if (rig.aperture === null) return;
  const scale = rig.apertureRestScale * (1 - rig.apertureTravel * cycle);
  rig.aperture.scale.y = scale;
  rig.aperture.scale.z = scale;
}
