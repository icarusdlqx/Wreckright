import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { DetachedPartPool } from './detachedPartPool';

describe('detached part pool', () => {
  it('throws a complete arm and mounted weapon from a fixed-size pool', () => {
    const scene = new Scene();
    const source = new Group();
    source.position.set(20, 15, 30);
    const geometry = new BoxGeometry(2, 4, 2);
    const material = new MeshStandardMaterial();
    const arm = new Mesh(geometry, material);
    arm.userData.damageLocation = 'left_arm';
    const hardpoint = new Group();
    hardpoint.userData.detachmentLocation = 'left_arm';
    hardpoint.add(new Mesh(geometry, material));
    source.add(arm, hardpoint);

    const pool = new DetachedPartPool(scene, () => 0, false);
    expect(scene.children).toHaveLength(12);
    expect(pool.spawn(source, 'left_arm', 4)).toBe(true);
    const visible = scene.children.find((child) => child.visible);
    expect(visible?.children).toHaveLength(2);

    for (let event = 0; event < 13; event += 1) {
      expect(pool.spawn(source, 'left_arm', event)).toBe(true);
    }
    expect(pool.activeCount()).toBe(12);
    expect(scene.children).toHaveLength(12);

    for (let frame = 0; frame < 600; frame += 1) pool.advance(1 / 60);
    expect(pool.activeCount()).toBe(0);
    pool.dispose();
    pool.dispose();
    expect(scene.children).toHaveLength(0);
    geometry.dispose();
    material.dispose();
  });

  it('keeps reduced-motion debris untumbled while still showing the loss', () => {
    const scene = new Scene();
    const source = new Group();
    source.position.y = 8;
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshStandardMaterial();
    const head = new Mesh(geometry, material);
    head.userData.damageLocation = 'head';
    source.add(head);
    const pool = new DetachedPartPool(scene, () => 0, true);
    expect(pool.spawn(source, 'head', 2)).toBe(true);
    pool.advance(0.5);
    const visible = scene.children.find((child) => child.visible);
    expect(visible?.rotation.x).toBe(0);
    expect(visible?.rotation.y).toBe(0);
    expect(visible?.rotation.z).toBe(0);
    pool.dispose();
    geometry.dispose();
    material.dispose();
  });

  it('throws only the severed lower leg and leaves the upper support stump behind', () => {
    const scene = new Scene();
    const source = new Group();
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshStandardMaterial();
    for (const joint of ['hip', 'knee', 'ankle'] as const) {
      const segment = new Mesh(geometry, material);
      segment.userData.damageLocation = 'left_leg';
      segment.userData.limbJoint = joint;
      source.add(segment);
    }
    const pool = new DetachedPartPool(scene, () => 0, false);

    expect(pool.spawn(source, 'left_leg', 3)).toBe(true);
    expect(scene.children.find((child) => child.visible)?.children).toHaveLength(2);
    pool.dispose();
    geometry.dispose();
    material.dispose();
  });
});
