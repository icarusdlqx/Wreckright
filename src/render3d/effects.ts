import {
  AdditiveBlending,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import { disposeObjectResources } from './sceneResources';

export { ScarLayer, SmokeLayer } from './battlefieldWear';

/**
 * Jet exhaust, drawn from the jump state rather than from an event. A jump is
 * an arc with a beginning and an end and nothing in between, so a plume spawned
 * on `jump_started` would have to guess how long to burn; reading `entity.jump`
 * every frame means the flame simply matches the arc.
 *
 * The plumes live here in world space and are never parented to a mech model:
 * a model is rebuilt and disposed whenever the mech loses a location, and
 * disposal traverses and destroys every material it finds under the root.
 */
export class JetLayer {
  readonly group = new Group();

  private readonly slots: { mesh: Mesh; material: MeshBasicMaterial }[] = [];
  private readonly used = new Set<number>();
  private readonly usedUnits = new Set<number>();
  /** Wobble per slot, so two jets on one mech are not the same flame twice. */
  private readonly phase: number[] = [];
  private lowFx = false;
  private reducedMotion = false;
  private disposed = false;

  constructor(private readonly capacity = 24) {
    this.group.name = 'jets';
    const geometry = new ConeGeometry(1, 1, 7, 1, true);
    // The cone is modelled pointing up and then flipped, so scaling its height
    // grows the flame downward from the nozzle rather than through the shin.
    geometry.translate(0, -0.5, 0);

    for (let index = 0; index < capacity; index += 1) {
      const material = new MeshBasicMaterial({
        color: 0xffd28a,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new Mesh(geometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.slots.push({ mesh, material });
      this.phase.push(index * 1.37);
    }
  }

  setPresentationMode(lowFx: boolean, reducedMotion: boolean): void {
    if (this.disposed) return;
    this.lowFx = lowFx;
    this.reducedMotion = reducedMotion;
  }

  /** Call once per frame before any plume(). */
  begin(): void {
    if (this.disposed) return;
    this.used.clear();
    this.usedUnits.clear();
  }

  /**
   * Lights one nozzle. `throttle` runs 0 to 1: hard on the pads to get off the
   * ground, cut over the top of the arc, relit to cushion the landing.
   */
  plume(key: number, at: Vector3, throttle: number, elapsed: number): void {
    if (this.disposed || throttle <= 0.02 || this.capacity <= 0) return;
    // Locomotion gives each unit two consecutive keys, one for each knee.
    const unitKey = Math.floor(key / 2);
    if (this.lowFx && this.usedUnits.has(unitKey)) return;
    const slotKey = this.lowFx ? unitKey : key;
    const index = ((slotKey % this.capacity) + this.capacity) % this.capacity;
    const slot = this.slots[index];
    if (slot === undefined) return;
    this.used.add(index);
    if (this.lowFx) this.usedUnits.add(unitKey);

    const flicker = this.reducedMotion
      ? 1
      : 0.85 + 0.15 * Math.sin(elapsed * 41 + (this.phase[index] ?? 0));
    slot.mesh.visible = true;
    slot.mesh.position.copy(at);
    slot.mesh.scale.set(2.4 + 1.6 * throttle, (9 + 30 * throttle) * flicker, 2.4 + 1.6 * throttle);
    slot.material.opacity = 0.62 * throttle;
    // White-hot at full throttle, guttering orange as it comes off the pads.
    slot.material.color.setHex(throttle > 0.6 ? 0xfff2c8 : 0xff9a3c);
  }

  /** Puts out every nozzle nobody lit this frame. */
  commit(): void {
    if (this.disposed) return;
    for (let index = 0; index < this.slots.length; index += 1) {
      if (this.used.has(index)) continue;
      const slot = this.slots[index];
      if (slot !== undefined) slot.mesh.visible = false;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeObjectResources(this.group);
    this.group.clear();
    this.slots.length = 0;
    this.phase.length = 0;
    this.used.clear();
    this.usedUnits.clear();
  }
}
