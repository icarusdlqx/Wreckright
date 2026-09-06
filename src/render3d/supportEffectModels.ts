import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
} from 'three';
import { UI } from '../render/palette';
import type { MechEntity } from '../sim/types';
import type { PendingCall } from '../sim/support';

export interface PendingVisual { outline: Line; eta: Line; craft: Group; trail: Line; craftMaterial: MeshStandardMaterial }
export interface CallMemory {
  active: boolean; team: number; x: number; y: number; heading: number; resolveTick: number;
  source: PendingCall | null; order: number;
}
export interface AirImpact { root: Group; flash: Mesh; ring: Mesh; smoke: Mesh; scar: Mesh }
export interface AirRun {
  active: boolean; age: number; x: number; y: number; heading: number; length: number;
  craft: Group; trail: Line; craftMaterial: MeshStandardMaterial; impacts: AirImpact[];
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

export function aircraft(slot: number | string): Pick<AirRun, 'craft' | 'trail' | 'craftMaterial'> {
  const craft = new Group();
  craft.name = `support-aircraft-${slot}`;
  craft.visible = false;
  const craftMaterial = new MeshStandardMaterial({ color: UI.friendly, roughness: 0.68 });
  const shell = new MeshStandardMaterial({ color: 0xe1d7b9, roughness: 0.82 });
  const dark = new MeshStandardMaterial({ color: 0x203e48, roughness: 0.6 });
  const fuselage = new Mesh(new BoxGeometry(40, 5.5, 8), shell);
  const canopy = new Mesh(new BoxGeometry(11, 3, 5), dark); canopy.position.set(9, 3.5, 0);
  craft.add(fuselage, canopy);
  for (const side of [-1, 1]) {
    const wing = new Mesh(new BoxGeometry(13, 2, 26), shell); wing.position.set(-3, 0, side * 13); wing.rotation.y = side * -0.2;
    const engine = new Mesh(new BoxGeometry(20, 5, 5), dark); engine.position.set(-6, -1.5, side * 12);
    const intake = new Mesh(new BoxGeometry(2.5, 5.5, 5.5), craftMaterial); intake.position.set(3.5, -1.5, side * 12);
    const fin = new Mesh(new BoxGeometry(9, 9, 2), craftMaterial); fin.position.set(-14, 5, side * 6);
    const exhaust = new Mesh(new BoxGeometry(5, 2.8, 2.8), new MeshBasicMaterial({ color: 0xffc27a })); exhaust.position.set(-18, -1.5, side * 12);
    craft.add(wing, engine, intake, fin, exhaust);
  }
  const trail = effectLine(`support-air-trail-${slot}`, 2, UI.selection, 0.55);
  effectPoint(trail, 0, -21, 0, 0);
  effectPoint(trail, 1, -105, 0, 0);
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

export function needsArmour(entity: MechEntity): boolean {
  return Object.values(entity.locations).some(
    (location) =>
      !location.destroyed &&
      (location.armour < location.armourMax || location.rearArmour < location.rearArmourMax),
  );
}
