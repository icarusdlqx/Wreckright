import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Raycaster, Vector3, type Material } from 'three';
import type { Faction } from '../schema/faction';
import type { Blueprint } from '../render/blueprint';
import { profileSection } from '../render/blueprint/connections';
import { markBlueprintDetail } from './modelDetail';

export interface MachineServices {
  jets: Object3D[];
  vents: Object3D[];
  heatMaterial: MeshStandardMaterial | null;
  enabled: boolean;
}

// These housings are a construction feature of the four authored jump frames.
const JET_HULLS = new Set(['hornet_hnt2', 'wisp_wsp1', 'votive_vtv2', 'falchion_fal2']);

/** Rear service ports are mounted on the actual body profile, never on a leg pivot. */
export function createMachineServices(plan: Blueprint, torso: Group, scale: number,
  identity: string | null, faction: Faction, destroyed: boolean,
  owned: Material[], failure: boolean): MachineServices {
  const services: MachineServices = { jets: [], vents: [], heatMaterial: null, enabled: !destroyed && !failure };
  if (!plan.articulated) return services;
  const bodies = plan.parts.filter((piece) => piece.location === 'centre_torso'
    && piece.detail === 'structure' && piece.shape === 'box' && !piece.tilt);
  const volume = (piece: typeof bodies[number]) => piece.size[0] * piece.size[1] * piece.size[2];
  const largest = Math.max(...bodies.map(volume));
  // Exclude slender gantry beams, then choose the substantial outer rear casing.
  const body = bodies.filter((piece) => volume(piece) >= largest * 0.3).sort((a, b) =>
    profileSection(a, 1, a.at[1])[0] - profileSection(b, 1, b.at[1])[0])[0];
  if (body === undefined) return services;
  const carriers: Mesh[] = [];
  torso.traverse((node) => {
    if (node instanceof Mesh && node.userData.damageLocation === 'centre_torso'
      && node.userData.blueprintDetail === 'structure') carriers.push(node);
  });
  torso.updateWorldMatrix(true, true);
  const ray = new Raycaster();
  const origin = new Vector3();
  const forward = new Vector3(1, 0, 0).transformDirection(torso.matrixWorld);
  const sealed = faction === 'aurelian';
  const material = new MeshStandardMaterial({ color: destroyed || failure ? 0x283036 : sealed ? 0x397d7b : 0x6c5940,
    emissive: sealed ? 0x70ccc4 : 0xe18745, emissiveIntensity: 0,
    roughness: 0.68, metalness: 0.24, flatShading: true });
  const shell = new MeshStandardMaterial({ color: destroyed || failure ? 0x202727 : 0x283f48,
    roughness: 0.74, metalness: 0.26, flatShading: true });
  owned.push(material, shell);
  services.heatMaterial = material;
  const jetHull = identity !== null && JET_HULLS.has(identity);
  const portWidth = body.size[2] * scale * 0.18;
  const portHeight = Math.max(scale * 0.12, body.size[1] * scale * 0.28);
  let mountHeight = 0.12;
  if (body.profile !== undefined) {
    const rearX = Math.min(...body.profile.map(([x]) => x));
    const edge = body.profile.filter(([x]) => Math.abs(x - rearX) < 1e-6).map(([, y]) => y);
    if (edge.length > 1) {
      // Roof caps have a short rear face: the entire port must sit below its bevel.
      const halfHeight = portHeight * (jetHull ? 0.725 : 0.5) / (body.size[1] * scale);
      const low = Math.min(...edge) + halfHeight + 0.03;
      const high = Math.max(...edge) - halfHeight - 0.03;
      if (low <= high) mountHeight = Math.max(low, Math.min(high, mountHeight));
    }
  }
  const y = body.at[1] + body.size[1] * mountHeight;
  const shellGeometry = jetHull ? new BoxGeometry(scale * 0.16, portHeight * 1.45, portWidth * 1.25) : null;
  const ventGeometry = new BoxGeometry(scale * 0.045, portHeight, portWidth);
  for (const side of [-1, 1]) {
    const z = (body.at[2] + side * body.size[2] * 0.24) * scale;
    origin.set(-scale * 8, y * scale, z);
    torso.localToWorld(origin);
    ray.set(origin, forward);
    // Construction-only raycast follows clipped/tapered and damaged armour exactly.
    const hit = ray.intersectObjects(carriers, false)[0];
    const rear = hit === undefined ? profileSection(body, 1, y)[0] * scale
      : torso.worldToLocal(hit.point).x;
    let x = rear - scale * (jetHull ? 0.07 : 0.01);
    if (mountHeight !== 0.12 && !jetHull) {
      // A clipped cap's corner section differs from its centre. Seat the thin plate
      // across the full rear-face depth so neither edge hangs clear of the casing.
      let near = Infinity, far = -Infinity;
      for (const vertical of [-1, 1]) for (const lateral of [-1, 1]) {
        origin.set(-scale * 8, y * scale + vertical * portHeight / 2, z + lateral * portWidth / 2);
        torso.localToWorld(origin);
        ray.set(origin, forward);
        const corner = ray.intersectObjects(carriers, false)[0];
        if (corner === undefined) continue;
        const depth = torso.worldToLocal(corner.point).x;
        near = Math.min(near, depth); far = Math.max(far, depth);
      }
      if (Number.isFinite(near)) x = (near + far) / 2 - scale * 0.001;
    }
    if (shellGeometry !== null) {
      const housing = new Mesh(shellGeometry, shell);
      housing.position.set(x, y * scale, z);
      housing.userData.damageLocation = 'centre_torso';
      housing.name = 'jump-service-housing';
      markBlueprintDetail(housing, 'structure');
      torso.add(housing);
      const nozzle = new Object3D();
      nozzle.name = 'jet-nozzle';
      nozzle.position.set(0, -portHeight * 0.725, 0);
      housing.add(nozzle);
      services.jets.push(nozzle);
    }
    const vent = new Mesh(ventGeometry, material);
    vent.position.set(x - (jetHull ? scale * 0.081 : 0), y * scale, z);
    vent.userData.damageLocation = 'centre_torso';
    vent.name = 'heat-vent';
    markBlueprintDetail(vent, 'surface');
    torso.add(vent);
    const outlet = new Object3D();
    outlet.name = 'vent-outlet';
    outlet.position.set(-scale * 0.025, portHeight * 0.35, 0);
    vent.add(outlet);
    services.vents.push(outlet);
  }
  return services;
}

/** One owned material changes without allocating a light, mesh or colour each frame. */
export function updateMachineHeat(services: MachineServices, fraction: number, powered: boolean): void {
  const material = services.heatMaterial;
  if (material === null) return;
  const hot = Math.max(0, Math.min(1, (fraction - 0.42) / 0.58));
  material.emissiveIntensity = services.enabled && powered ? hot * hot * 1.45 : 0;
}
