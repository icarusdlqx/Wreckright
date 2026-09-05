import { Group, Mesh } from 'three';
import type { MechLocation } from '../schema/common';

export interface AssemblyRig {
  pivot: Group;
  location: MechLocation;
}

export interface ModelArticulation {
  arms: AssemblyRig[];
  shoulders: AssemblyRig[];
}

/** Reparenting keeps every authored plate offset and damage deformation intact. */
export function createModelArticulation(torso: Group): ModelArticulation {
  const result: ModelArticulation = { arms: [], shoulders: [] };
  for (const location of ['left_arm', 'right_arm', 'left_torso', 'right_torso'] as const) {
    const children = torso.children.filter((child) => child.userData.damageLocation === location
      || child.userData.detachmentLocation === location);
    const carrier = children.find((child) => child instanceof Mesh);
    if (!(carrier instanceof Mesh)) continue;
    carrier.geometry.computeBoundingBox();
    const bounds = carrier.geometry.boundingBox;
    const pivot = new Group();
    const arm = location.endsWith('_arm');
    pivot.position.set(carrier.position.x,
      carrier.position.y + (arm ? (bounds?.max.y ?? 0) * 0.7 : 0), carrier.position.z);
    pivot.name = `${location}-assembly`;
    for (const child of children) {
      child.position.sub(pivot.position);
      pivot.add(child);
    }
    torso.add(pivot);
    (arm ? result.arms : result.shoulders).push({ pivot, location });
  }
  return result;
}

/** Powered assemblies recover their authored rest frame before applying this frame's motion. */
export function resetModelArticulation(rig: ModelArticulation): void {
  for (const assembly of rig.arms) assembly.pivot.rotation.set(0, 0, 0);
  for (const assembly of rig.shoulders) assembly.pivot.rotation.set(0, 0, 0);
}

export function settleTerminalAssemblies(rig: ModelArticulation, amount: number,
  roll: number, sealed: boolean): void {
  const restraint = sealed ? 0.72 : 1;
  for (const arm of rig.arms) {
    const side = arm.location === 'left_arm' ? -1 : 1;
    arm.pivot.rotation.x = side * amount * 0.24 * restraint;
    arm.pivot.rotation.z = amount * (0.27 + side * roll * 0.12) * restraint;
  }
  for (const shoulder of rig.shoulders) {
    const side = shoulder.location === 'left_torso' ? -1 : 1;
    shoulder.pivot.rotation.x = side * amount * 0.11 * restraint;
    shoulder.pivot.rotation.z = amount * 0.09 * restraint;
  }
}
