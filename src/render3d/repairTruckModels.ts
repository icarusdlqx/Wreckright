import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, RingGeometry, SphereGeometry, type Line } from 'three';
import { UI } from '../render/palette';
import { effectLine } from './supportEffectModels';

export const REPAIR_LINKS = 6;
export interface RepairVisual {
  phase: 'hidden' | 'incoming' | 'working' | 'departing';
  seen: boolean; team: number; x: number; y: number; endTick: number; age: number;
  parkX: number; parkY: number;
  root: Group; vehicle: Group; boom: Group; radius: Mesh; progress: Line; hub: Group; tether: Line;
  colour: MeshStandardMaterial; beacon: Mesh; dust: Mesh; lift: Group; links: Line[]; welds: Mesh[];
}

export function repairTruckModel(slot: number): RepairVisual {
  const root = new Group(); root.name = `support-repair-truck-${slot}`; root.visible = false;
  const vehicle = new Group(); vehicle.name = `repair-vehicle-${slot}`; root.add(vehicle);
  const colour = new MeshStandardMaterial({ color: UI.friendly, roughness: 0.78 });
  const shell = new MeshStandardMaterial({ color: 0xe5c793, roughness: 0.85 });
  const dark = new MeshStandardMaterial({ color: 0x25464c, roughness: 0.9 });
  const glass = new MeshStandardMaterial({ color: 0x12323a, roughness: 0.4, metalness: 0.25 });
  const box = (parent: Group, size: [number, number, number], at: [number, number, number], material: MeshStandardMaterial): Mesh => {
    const mesh = new Mesh(new BoxGeometry(...size), material); mesh.position.set(...at); parent.add(mesh); return mesh;
  };
  box(vehicle, [24, 4, 11], [0, 4.2, 0], dark);
  box(vehicle, [8.5, 8, 10.5], [7, 8, 0], shell);
  box(vehicle, [1, 3.7, 8.8], [11.4, 9, 0], glass);
  box(vehicle, [12, 5.5, 10.3], [-4.5, 7, 0], shell);
  box(vehicle, [10, 1.5, 11], [-4.5, 9.8, 0], colour);
  box(vehicle, [2.2, 1, 6.2], [-4.5, 10.7, 0], dark);
  box(vehicle, [6.2, 1, 2.2], [-4.5, 10.7, 0], dark);
  for (const x of [-8, 0, 8]) for (const z of [-5.8, 5.8]) {
    const wheel = new Mesh(new CylinderGeometry(2.8, 2.8, 1.8, 10), dark);
    wheel.position.set(x, 2.8, z); wheel.rotation.x = Math.PI / 2; vehicle.add(wheel);
  }
  const boom = new Group(); boom.name = `repair-boom-${slot}`; boom.position.set(-6, 10.5, 0); vehicle.add(boom);
  box(boom, [2, 5, 2], [0, 2, 0], dark);
  const arm = box(boom, [13, 1.8, 1.8], [5, 5, 0], colour); arm.rotation.z = 0.2;
  const beacon = new Mesh(new SphereGeometry(1.35, 8, 6), new MeshBasicMaterial({ color: 0xffc16b }));
  beacon.name = `repair-beacon-${slot}`; beacon.position.set(7, 13, 0); vehicle.add(beacon);
  const lift = new Group(); lift.name = `repair-airlift-${slot}`; vehicle.add(lift);
  box(lift, [12, 3, 24], [0, 47, 0], shell);
  for (const side of [-1, 1]) {
    box(lift, [20, 5, 5], [0, 47, side * 12], dark);
    const cable = effectLine(`repair-lift-cable-${slot}-${side}`, 3, 0xacc8bf, 0.7);
    const positions = cable.geometry.getAttribute('position') as { setXYZ: (index: number, x: number, y: number, z: number) => void; needsUpdate: boolean };
    positions.setXYZ(0, -8, 11, side * 5); positions.setXYZ(1, 0, 45, side * 12); positions.setXYZ(2, 8, 12, side * 5); positions.needsUpdate = true;
    cable.visible = true; lift.add(cable);
  }
  const radius = new Mesh(new RingGeometry(0.982, 1, 56), new MeshBasicMaterial({ color: 0x9ae5c3, transparent: true, opacity: 0.68, depthWrite: false }));
  radius.name = `support-repair-radius-${slot}`; radius.rotation.x = -Math.PI / 2; radius.position.y = 1; root.add(radius);
  const hub = new Group(); hub.name = `repair-service-hub-${slot}`; root.add(hub);
  const hubMaterial = new MeshStandardMaterial({ color: 0xbfe5d1, emissive: 0x51b994, emissiveIntensity: 0.4, roughness: 0.75 });
  box(hub, [8, 0.8, 2], [0, 1.5, 0], hubMaterial);
  box(hub, [2, 0.8, 8], [0, 1.5, 0], hubMaterial);
  const tether = effectLine(`repair-service-tether-${slot}`, 3, 0x9ae5c3, 0.85); root.add(tether);
  const progress = effectLine(`repair-service-clock-${slot}`, 49, 0xffd09b, 0.85); root.add(progress);
  const dust = new Mesh(new RingGeometry(0.65, 1, 24), new MeshBasicMaterial({ color: 0xe2c594, transparent: true, opacity: 0, depthWrite: false }));
  dust.rotation.x = -Math.PI / 2; dust.position.y = 1.2; root.add(dust);
  const links: Line[] = []; const welds: Mesh[] = [];
  for (let index = 0; index < REPAIR_LINKS; index++) {
    const link = effectLine(`support-repair-link-${slot}-${index}`, 3, 0xa8efca, 0.8); links.push(link); root.add(link);
    const weld = new Mesh(new SphereGeometry(1, 5, 4), new MeshBasicMaterial({ color: 0xffe5a0 }));
    weld.name = `repair-weld-${slot}-${index}`; weld.visible = false; welds.push(weld); root.add(weld);
  }
  return { phase: 'hidden', seen: false, team: -1, x: 0, y: 0, endTick: -1, age: 0,
    parkX: 0, parkY: 0, root, vehicle, boom, radius, progress, hub, tether, colour, beacon, dust, lift, links, welds };
}
