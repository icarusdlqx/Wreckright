import { CircleGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import type { TeamVision } from '../sim/sensors';

const CONTACT_RED = 0xff4655;

/** Only sanitized team reports enter this layer; hidden models and routes cannot leak into it. */
export class SensorMarkerPool {
  readonly group = new Group();
  private readonly dotGeometry = new CircleGeometry(6, 24);
  private readonly ringGeometry = new RingGeometry(8, 10, 32);
  private readonly live = new MeshBasicMaterial({ color: CONTACT_RED, fog: false, depthTest: false, depthWrite: false, transparent: true, opacity: 1 });
  private readonly halo = new MeshBasicMaterial({ color: 0xffbac0, fog: false, depthTest: false, depthWrite: false, transparent: true, opacity: 0.72 });
  private readonly memory = new MeshBasicMaterial({ color: 0xff8990, fog: false, depthTest: false, depthWrite: false, transparent: true, opacity: 0.32 });
  private readonly markers: Group[] = [];

  constructor(private readonly heightAt: (x: number, y: number) => number) {
    this.group.name = 'sensor-contacts';
  }

  draw(vision: TeamVision | null | undefined): void {
    let used = 0;
    for (const track of vision?.tracks.values() ?? []) {
      if (vision?.visible.has(track.id)) continue;
      let marker = this.markers[used];
      if (marker === undefined) {
        marker = new Group();
        const dot = new Mesh(this.dotGeometry, this.live);
        const ring = new Mesh(this.ringGeometry, this.halo);
        dot.rotation.x = ring.rotation.x = -Math.PI / 2;
        dot.renderOrder = 12;
        ring.renderOrder = 11;
        marker.add(dot, ring);
        this.markers.push(marker);
        this.group.add(marker);
      }
      used += 1;
      const current = vision?.detected.has(track.id) === true;
      marker.name = `sensor-contact-${track.id}`;
      marker.userData = { contactId: track.id, current };
      marker.position.set(track.pos.x, this.heightAt(track.pos.x, track.pos.y) + 2, track.pos.y);
      marker.visible = true;
      marker.children[0]!.visible = current;
      (marker.children[1] as Mesh).material = current ? this.halo : this.memory;
    }
    this.group.visible = used > 0;
    for (let index = used; index < this.markers.length; index += 1) this.markers[index]!.visible = false;
  }

  dispose(): void {
    this.dotGeometry.dispose();
    this.ringGeometry.dispose();
    this.live.dispose();
    this.halo.dispose();
    this.memory.dispose();
  }
}
