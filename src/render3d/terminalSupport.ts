import { InstancedMesh, Mesh, Vector3, type Object3D } from 'three';
import type { MechModel } from './modelTypes';

interface SupportSurface {
  mesh: Mesh;
  points: Float32Array;
}

export interface TerminalSupportRig {
  surfaces: SupportSurface[];
  pose: number[];
  lift: number;
}

const POINT = new Vector3();

/** Capture unique authored vertices once; a box proxy leaves sloped armour hovering. */
export function createTerminalSupport(root: Object3D): TerminalSupportRig {
  const surfaces: SupportSurface[] = [];
  root.traverse((mesh) => {
    if (!(mesh instanceof Mesh) || mesh instanceof InstancedMesh
      || mesh.userData.blueprintDetail !== 'structure') return;
    const vertices = mesh.geometry.getAttribute('position');
    const unique = new Set<string>();
    const points: number[] = [];
    for (let index = 0; index < vertices.count; index += 1) {
      const x = vertices.getX(index), y = vertices.getY(index), z = vertices.getZ(index);
      const key = `${x},${y},${z}`;
      if (unique.has(key)) continue;
      unique.add(key);
      points.push(x, y, z);
    }
    surfaces.push({ mesh, points: new Float32Array(points) });
  });
  return { surfaces, pose: Array<number>(9).fill(Number.NaN), lift: 0 };
}

/** The articulated shell meets the terrain instead of rotating half its volume underground. */
export function supportTerminalOnGround(model: MechModel, fall: number,
  heightAt: (x: number, y: number) => number, depth = 0): void {
  const rig = model.terminalSupport;
  const root = model.root;
  const pose = rig.pose;
  const same = pose[0] === root.position.x && pose[1] === root.position.y && pose[2] === root.position.z
    && pose[3] === root.rotation.x && pose[4] === root.rotation.y && pose[5] === root.rotation.z
    && pose[6] === model.torso.rotation.y && pose[7] === fall && pose[8] === depth;
  if (same) {
    root.position.y += rig.lift;
    return;
  }
  pose[0] = root.position.x; pose[1] = root.position.y; pose[2] = root.position.z;
  pose[3] = root.rotation.x; pose[4] = root.rotation.y; pose[5] = root.rotation.z;
  pose[6] = model.torso.rotation.y; pose[7] = fall; pose[8] = depth;
  root.updateWorldMatrix(true, true);
  let lift = 0;
  for (const surface of rig.surfaces) {
    const { mesh, points } = surface;
    for (let index = 0; index < points.length; index += 3) {
      POINT.set(points[index]!, points[index + 1]!, points[index + 2]!).applyMatrix4(mesh.matrixWorld);
      lift = Math.max(lift, heightAt(POINT.x, POINT.z) + depth - POINT.y);
    }
  }
  rig.lift = lift;
  root.position.y += lift;
}
