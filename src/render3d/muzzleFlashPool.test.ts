import { PointLight, Scene, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { MuzzleFlashPool } from './muzzleFlashPool';

function pointLights(scene: Scene): PointLight[] {
  return scene.children.filter((child): child is PointLight => child instanceof PointLight);
}

describe('MuzzleFlashPool', () => {
  it('preallocates exactly four unshadowed lights and never mutates the scene per shot', () => {
    const scene = new Scene();
    const pool = new MuzzleFlashPool(scene);
    const lights = pointLights(scene);
    const add = vi.spyOn(scene, 'add');

    expect(lights).toHaveLength(4);
    expect(lights.every((light) => !light.castShadow && !light.visible)).toBe(true);
    for (let index = 0; index < 20; index += 1) {
      pool.trigger(new Vector3(index, 12, 24), 0xffcc88, 8);
    }

    expect(pointLights(scene)).toEqual(lights);
    expect(add).not.toHaveBeenCalled();
    pool.destroy();
  });

  it('recycles the oldest active generation when all four lights are occupied', () => {
    const scene = new Scene();
    const pool = new MuzzleFlashPool(scene);

    for (let index = 1; index <= 4; index += 1) {
      pool.trigger(new Vector3(index * 10, 12, 24), 0xffcc88, 8);
      pool.advance(0.005);
    }
    pool.trigger(new Vector3(50, 12, 24), 0xffcc88, 8);

    const positions = pointLights(scene).map((light) => light.position.x).sort((a, b) => a - b);
    expect(positions).toEqual([20, 30, 40, 50]);
    pool.destroy();
  });

  it('hides active lights immediately while disabled and admits only fresh flashes later', () => {
    const scene = new Scene();
    const pool = new MuzzleFlashPool(scene);
    const lights = pointLights(scene);

    pool.trigger(new Vector3(10, 12, 24), 0xffcc88, 8);
    expect(lights.some((light) => light.visible)).toBe(true);

    pool.setEnabled(false);
    expect(lights.every((light) => !light.visible && light.intensity === 0)).toBe(true);
    pool.trigger(new Vector3(20, 12, 24), 0xffcc88, 8);
    expect(lights.every((light) => !light.visible)).toBe(true);

    pool.setEnabled(true);
    pool.trigger(new Vector3(30, 12, 24), 0xffcc88, 8);
    expect(lights.filter((light) => light.visible)).toHaveLength(1);
    expect(lights.find((light) => light.visible)?.position.x).toBe(30);
    pool.destroy();
  });
});
