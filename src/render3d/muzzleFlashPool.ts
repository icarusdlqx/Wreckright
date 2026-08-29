import { PointLight, Scene, Vector3 } from 'three';
import { disposeObjectResources } from './sceneResources';
import { safeShotDelta } from './shotPoolCore';

interface MuzzleFlash {
  readonly light: PointLight;
  ttl: number;
  intensity: number;
  generation: number;
}

const FLASH_LIFE = 0.09;
const FLASH_CAPACITY = 4;

/** Four reusable lights keep volleys readable without multiplying GPU light work. */
export class MuzzleFlashPool {
  private readonly flashes: MuzzleFlash[];
  private generation = 0;
  private enabled = true;
  private destroyed = false;

  constructor(private readonly scene: Scene) {
    this.flashes = Array.from({ length: FLASH_CAPACITY }, () => {
      const light = new PointLight(0xffffff, 0, 120, 2);
      light.castShadow = false;
      light.visible = false;
      scene.add(light);
      return { light, ttl: 0, intensity: 0, generation: 0 };
    });
  }

  trigger(at: Vector3, colour: number, damage: number): void {
    if (this.destroyed || !this.enabled) return;
    let flash = this.flashes[0];
    if (flash === undefined) return;
    for (let index = 0; index < this.flashes.length; index += 1) {
      const candidate = this.flashes[index];
      if (candidate === undefined) continue;
      if (candidate.ttl <= 0) {
        flash = candidate;
        break;
      }
      if (candidate.generation < flash.generation) flash = candidate;
    }
    this.generation += 1;
    flash.generation = this.generation;
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
        flash.ttl = 0;
        flash.light.visible = false;
        flash.light.intensity = 0;
      } else {
        flash.light.intensity = flash.intensity * flash.ttl / FLASH_LIFE;
      }
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.destroyed || this.enabled === enabled) return;
    this.enabled = enabled;
    if (enabled) return;
    for (const flash of this.flashes) {
      flash.ttl = 0;
      flash.intensity = 0;
      flash.light.intensity = 0;
      flash.light.visible = false;
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
