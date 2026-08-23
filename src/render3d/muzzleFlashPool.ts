import { PointLight, Scene, Vector3 } from 'three';
import { disposeObjectResources } from './sceneResources';
import { safeShotDelta } from './shotPoolCore';

interface MuzzleFlash {
  readonly light: PointLight;
  ttl: number;
  intensity: number;
}

const FLASH_LIFE = 0.09;

/** A fixed light budget keeps a full lance volley readable without scene churn. */
export class MuzzleFlashPool {
  private readonly flashes: MuzzleFlash[];
  private cursor = 0;
  private destroyed = false;

  constructor(private readonly scene: Scene, capacity: number) {
    this.flashes = Array.from({ length: capacity }, () => {
      const light = new PointLight(0xffffff, 0, 120, 2);
      light.visible = false;
      scene.add(light);
      return { light, ttl: 0, intensity: 0 };
    });
  }

  trigger(at: Vector3, colour: number, damage: number): void {
    if (this.destroyed || this.flashes.length === 0) return;
    let selected = -1;
    for (let offset = 0; offset < this.flashes.length; offset += 1) {
      const index = (this.cursor + offset) % this.flashes.length;
      if ((this.flashes[index]?.ttl ?? 1) <= 0) {
        selected = index;
        break;
      }
    }
    if (selected < 0) selected = this.cursor;
    const flash = this.flashes[selected];
    if (flash === undefined) return;
    this.cursor = (selected + 1) % this.flashes.length;
    flash.ttl = FLASH_LIFE;
    flash.intensity = 300 + damage * 40;
    flash.light.color.setHex(colour);
    flash.light.intensity = flash.intensity;
    flash.light.position.copy(at);
    flash.light.visible = true;
  }

  advance(deltaSeconds: number): void {
    if (this.destroyed) return;
    const delta = safeShotDelta(deltaSeconds);
    for (const flash of this.flashes) {
      if (flash.ttl <= 0) continue;
      flash.ttl -= delta;
      if (flash.ttl <= 0) {
        flash.light.visible = false;
        flash.light.intensity = 0;
      } else {
        flash.light.intensity = flash.intensity * flash.ttl / FLASH_LIFE;
      }
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const flash of this.flashes) {
      this.scene.remove(flash.light);
      disposeObjectResources(flash.light);
    }
    this.flashes.length = 0;
  }
}
