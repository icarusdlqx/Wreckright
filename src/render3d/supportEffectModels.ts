import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
} from 'three';
import { UI } from '../render/palette';
import type { MechEntity } from '../sim/types';

export const LINKS_PER_TRUCK = 6;

export interface PendingVisual { outline: Line; eta: Line }
export interface CallMemory {
  active: boolean; team: number; x: number; y: number; heading: number; resolveTick: number;
}
export interface AirImpact { root: Group; flash: Mesh; ring: Mesh; smoke: Mesh; scar: Mesh }
export interface AirRun {
  active: boolean; age: number; x: number; y: number; heading: number; length: number;
  craft: Group; trail: Line; craftMaterial: MeshBasicMaterial; impacts: AirImpact[];
}
export interface TruckVisual {
  active: boolean; team: number; x: number; y: number; expiresTick: number;
  root: Group; radius: Mesh; bodyMaterial: MeshBasicMaterial; links: Line[];
}

export function effectLine(name: string, points: number, colour: number, opacity: number): Line {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(points * 3), 3));
  const result = new Line(
    geometry,
    new LineBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false }),
  );
  result.name = name;
  result.frustumCulled = false;
  result.visible = false;
  return result;
}

export function effectPoint(
  target: Line,
  index: number,
  x: number,
  y: number,
  z: number,
): void {
  (target.geometry.getAttribute('position') as BufferAttribute).setXYZ(index, x, y, z);
}

export function aircraft(slot: number): Pick<AirRun, 'craft' | 'trail' | 'craftMaterial'> {
  const craft = new Group();
  craft.name = `support-aircraft-${slot}`;
  craft.visible = false;
  const craftMaterial = new MeshBasicMaterial({ color: UI.friendly });
  const dark = new MeshBasicMaterial({ color: 0x1b252c });
  const fuselage = new Mesh(new BoxGeometry(28, 4, 5), craftMaterial);
  const wing = new Mesh(new BoxGeometry(9, 1.5, 32), craftMaterial);
  const tail = new Mesh(new BoxGeometry(7, 7, 2), dark);
  tail.position.set(-11, 3, 0);
  craft.add(fuselage, wing, tail);
  const trail = effectLine(`support-air-trail-${slot}`, 2, UI.selection, 0.55);
  effectPoint(trail, 0, -14, 0, 0);
  effectPoint(trail, 1, -95, 0, 0);
  (trail.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  trail.visible = true;
  craft.add(trail);
  return { craft, trail, craftMaterial };
}

export function airImpact(run: number, index: number): AirImpact {
  const root = new Group();
  root.name = `support-air-impact-${run}-${index}`;
  const flash = new Mesh(
    new SphereGeometry(1, 7, 5),
    new MeshBasicMaterial({ color: UI.explosion, transparent: true, opacity: 0, depthWrite: false }),
  );
  const ring = new Mesh(
    new RingGeometry(0.72, 1, 14),
    new MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.8;
  const smoke = new Mesh(
    new SphereGeometry(1, 7, 5),
    new MeshBasicMaterial({ color: UI.smoke, transparent: true, opacity: 0, depthWrite: false }),
  );
  const scar = new Mesh(
    new CircleGeometry(1, 12),
    new MeshBasicMaterial({ color: 0x17110d, transparent: true, opacity: 0.62, depthWrite: false }),
  );
  scar.name = `support-air-scar-${run}-${index}`;
  scar.rotation.x = -Math.PI / 2;
  scar.scale.setScalar(10);
  scar.position.y = 0.35;
  scar.visible = false;
  flash.visible = false;
  ring.visible = false;
  smoke.visible = false;
  root.add(flash, ring, smoke, scar);
  return { root, flash, ring, smoke, scar };
}

export function truck(slot: number): TruckVisual {
  const root = new Group();
  root.name = `support-repair-truck-${slot}`;
  root.visible = false;
  const bodyMaterial = new MeshBasicMaterial({ color: UI.friendly });
  const dark = new MeshBasicMaterial({ color: 0x20292e });
  const chassis = new Mesh(new BoxGeometry(16, 3.8, 8), bodyMaterial);
  chassis.position.y = 3.4;
  const cab = new Mesh(new BoxGeometry(6, 5.8, 7.5), bodyMaterial);
  cab.position.set(4.5, 6.4, 0);
  const boom = new Mesh(new BoxGeometry(9, 1.2, 1.2), dark);
  boom.position.set(-3, 7.1, 0);
  boom.rotation.z = -0.32;
  root.add(chassis, cab, boom);
  for (const x of [-5, 5]) for (const z of [-4.2, 4.2]) {
    const wheel = new Mesh(new CylinderGeometry(2, 2, 1.2, 8), dark);
    wheel.position.set(x, 2, z);
    wheel.rotation.x = Math.PI / 2;
    root.add(wheel);
  }
  const radius = new Mesh(
    new RingGeometry(0.965, 1, 40),
    new MeshBasicMaterial({ color: UI.selection, transparent: true, opacity: 0.34, depthWrite: false }),
  );
  radius.name = `support-repair-radius-${slot}`;
  radius.rotation.x = -Math.PI / 2;
  radius.position.y = 0.8;
  root.add(radius);
  const links: Line[] = [];
  for (let index = 0; index < LINKS_PER_TRUCK; index += 1) {
    const repair = effectLine(`support-repair-link-${slot}-${index}`, 2, 0x8ce8bd, 0.7);
    root.add(repair);
    links.push(repair);
  }
  return { active: false, team: -1, x: 0, y: 0, expiresTick: -1, root, radius, bodyMaterial, links };
}

export function needsArmour(entity: MechEntity): boolean {
  return Object.values(entity.locations).some(
    (location) =>
      !location.destroyed &&
      (location.armour < location.armourMax || location.rearArmour < location.rearArmourMax),
  );
}
