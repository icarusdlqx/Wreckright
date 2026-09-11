import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
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
  it.each(['expiry', 'dispose'] as const)(
    'depowers detached emitters without touching live equipment and releases their shared clone on %s',
    (retire) => {
      const scene = new Scene(), source = new Group();
      const geometry = new BoxGeometry(1, 3, 1);
      const material = new MeshStandardMaterial({ color: 0x44ff66, emissive: 0x44ff66,
        emissiveIntensity: 2, roughness: 0.25 });
      const originalColour = material.color.clone();
      const originalEmission = material.emissive.clone();
      const sourceMaterialDispose = vi.spyOn(material, 'dispose');
      const sourceGeometryDispose = vi.spyOn(geometry, 'dispose');
      const hardpoint = new Group();
      hardpoint.userData.detachmentLocation = 'right_arm';
      hardpoint.add(new Mesh(geometry, material), new Mesh(geometry, material));
      source.add(hardpoint); source.position.y = 18;
      const pool = new DetachedPartPool(scene, () => 0, false);
      expect(pool.spawn(source, 'right_arm', 1)).toBe(true);
      const detached = scene.children.find((child) => child.visible)!;
      const first = detached.children[0] as Mesh;
      const second = detached.children[1] as Mesh;
      const cold = first.material as MeshStandardMaterial;
      const cloneMaterialDispose = vi.spyOn(cold, 'dispose');
      const cloneGeometryDispose = vi.spyOn(first.geometry, 'dispose');
      expect(cold).not.toBe(material);
      expect(second.material).toBe(cold);
      expect(second.geometry).toBe(first.geometry);
      expect(cold.emissiveIntensity).toBe(0);
      expect(cold.color.r).toBeCloseTo(originalColour.r * 0.12);
      for (let frame = 0; frame < 180; frame += 1) pool.advance(1 / 60);
      expect(cold.emissiveIntensity).toBe(0);
      expect(material.emissiveIntensity).toBe(2);
      expect(material.color.equals(originalColour)).toBe(true);
      expect(material.emissive.equals(originalEmission)).toBe(true);
      expect(material.roughness).toBe(0.25);
      if (retire === 'expiry') for (let frame = 0; frame < 360; frame += 1) pool.advance(1 / 60);
      else pool.dispose();
      expect(cloneMaterialDispose).toHaveBeenCalledTimes(1);
      expect(cloneGeometryDispose).toHaveBeenCalledTimes(1);
      pool.dispose();
      expect(cloneMaterialDispose).toHaveBeenCalledTimes(1);
      expect(cloneGeometryDispose).toHaveBeenCalledTimes(1);
      expect(sourceMaterialDispose).not.toHaveBeenCalled();
      expect(sourceGeometryDispose).not.toHaveBeenCalled();
      geometry.dispose(); material.dispose();
    },
  );

});
