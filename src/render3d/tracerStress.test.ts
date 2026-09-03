import {
  BufferGeometry,
  InstancedMesh,
  Matrix4,
  Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Weapon } from '../schema/weapon';
import { TracerLayer } from './tracers';

const STYLES: readonly Weapon['visual']['style'][] = [
  'beam',
  'pulse',
  'bolt',
  'flame',
  'tracer',
  'burst',
  'slug',
  'missile',
];

function visual(style: Weapon['visual']['style']): Weapon['visual'] {
  return { style, colour: '#ffffff', width: 3, arc: style === 'missile' ? 36 : 0 };
}

function resources(layer: TracerLayer): {
  geometries: Set<BufferGeometry>;
  materials: Set<Material>;
} {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  layer.group.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    geometries.add(node.geometry);
    if (Array.isArray(node.material)) node.material.forEach((material) => materials.add(material));
    else materials.add(node.material);
  });
  return { geometries, materials };
}

describe('fixed tracer pools', () => {
  it('renders instance colours without requiring missing vertex-colour attributes', () => {
    const layer = new TracerLayer();
    const meshes = layer.group.children.filter((node): node is InstancedMesh => (
      node instanceof InstancedMesh
    ));

    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) {
      expect(mesh.geometry.getAttribute('color')).toBeUndefined();
      expect(mesh.material).toBeInstanceOf(MeshBasicMaterial);
      expect((mesh.material as MeshBasicMaterial).vertexColors).toBe(false);
      expect(mesh.instanceColor).not.toBeNull();
    }

    layer.dispose();
  });

  it('keeps 1,000 mixed events inside the preallocated scene and resource set', () => {
    const layer = new TracerLayer();
    const children = [...layer.group.children];
    const before = resources(layer);
    const add = vi.spyOn(Object3D.prototype, 'add');
    const remove = vi.spyOn(Object3D.prototype, 'remove');
    const clone = vi.spyOn(Vector3.prototype, 'clone');
    const splice = vi.spyOn(Array.prototype, 'splice');
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(Material.prototype, 'dispose');
    const instanceDispose = vi.spyOn(InstancedMesh.prototype, 'dispose');
    const muzzle = new Vector3(4, 18, 7);

    for (let event = 0; event < 1_000; event += 1) {
      const style = STYLES[event % STYLES.length];
      if (style === undefined) continue;
      layer.fire(
        muzzle,
        { x: 90 + event % 40, y: event % 30 },
        visual(style),
        12,
        style === 'beam' || style === 'pulse' || style === 'bolt' || style === 'flame'
          ? null
          : 500,
        0x78c9ff,
        () => 0,
      );
      if (event % 4 === 0) layer.impact({ x: event % 60, y: event % 50 }, 0, 0xffc857);
      if (event % 17 === 0) layer.spawnSmoke({ x: event % 70, y: event % 40 }, 0);
      if (event % 31 === 0) layer.burst({ x: 10, y: 20 }, 0, 'critical', 0xff7d4c, 1.2);
      layer.update(1 / 120);
    }

    const after = resources(layer);
    expect(layer.group.children).toEqual(children);
    expect(after.geometries).toEqual(before.geometries);
    expect(after.materials).toEqual(before.materials);
    expect(layer.stats().capacity).toBeLessThanOrEqual(512);
    expect(layer.stats().active).toBeLessThanOrEqual(layer.stats().capacity);
    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(clone).not.toHaveBeenCalled();
    expect(splice).not.toHaveBeenCalled();
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    expect(instanceDispose).not.toHaveBeenCalled();

    add.mockRestore();
    remove.mockRestore();
    clone.mockRestore();
    splice.mockRestore();
    geometryDispose.mockRestore();
    materialDispose.mockRestore();
    instanceDispose.mockRestore();
    layer.dispose();
  });

  it('copies mutable event coordinates into owned tracks', () => {
    const layer = new TracerLayer();
    const from = new Vector3(0, 14, 0);
    const to = { x: 100, y: 0 };
    layer.fire(from, to, visual('missile'), 1, 500, 0xffffff, () => 0);
    from.set(900, 900, 900);
    to.x = -500;
    to.y = -500;
    layer.update(0.1);

    const missile = layer.group.getObjectByName('shot-missile') as InstancedMesh;
    const matrix = new Matrix4();
    missile.getMatrixAt(0, matrix);
    expect(new Vector3().setFromMatrixPosition(matrix).x).toBeCloseTo(50);
  });

  it('reduces simultaneous reads in low-FX and reduced-motion modes', () => {
    const full = new TracerLayer();
    const low = new TracerLayer();
    const reduced = new TracerLayer();
    low.setPresentationMode(true, false);
    reduced.setPresentationMode(false, true);
    const fire = (layer: TracerLayer): void => layer.fire(
      new Vector3(0, 14, 0),
      { x: 100, y: 0 },
      visual('burst'),
      12,
      500,
      0xffffff,
      () => 0,
    );
    fire(full);
    fire(low);
    fire(reduced);

    expect(full.stats().families.shell.active).toBe(12);
    expect(low.stats().families.shell.active).toBe(1);
    expect(reduced.stats().families.shell.active).toBe(2);
    expect(full.stats().families.burst.active).toBe(1);
    expect(low.stats().families.burst.active).toBe(0);
    expect(reduced.stats().families.burst.active).toBe(0);
  });

  it('absorbs the audited 4x missile and explosion peak without overwriting', () => {
    const layer = new TracerLayer();
    const engagement = { shooterId: 1, targetId: 2, weaponId: 'lrm20' };
    const muzzle = new Vector3(0, 14, 0);

    // Six full twenty-tube salvos in the air at once is the audited peak.
    for (let volley = 0; volley < 6; volley += 1) {
      layer.fire(
        muzzle,
        { x: 600, y: 40 },
        visual('missile'),
        20,
        300,
        0xffffff,
        () => 0,
        engagement,
        2,
      );
    }
    for (let explosion = 0; explosion < 106; explosion += 1) {
      layer.burst({ x: explosion, y: 0 }, 0, 'terminal', 0xff6b38, 1);
    }

    const stats = layer.stats();
    expect(stats.families.missile.capacity).toBeGreaterThanOrEqual(120);
    expect(stats.families.missile.active).toBe(120);
    expect(stats.families.missile.evicted).toBe(0);
    expect(stats.families.burst.capacity).toBeGreaterThanOrEqual(106);
    expect(stats.families.burst.active).toBe(112);
    expect(stats.families.burst.evicted).toBe(0);
    layer.dispose();
  });

  it('keeps low-FX salvo density capped after the full pools grow', () => {
    const layer = new TracerLayer();
    layer.setPresentationMode(true, false);
    for (let volley = 0; volley < 20; volley += 1) {
      layer.fire(
        new Vector3(0, 14, 0),
        { x: 600, y: 0 },
        visual('missile'),
        20,
        300,
        0xffffff,
        () => 0,
        { shooterId: volley, targetId: 40, weaponId: 'lrm20' },
        2,
      );
    }

    expect(layer.stats().families.missile.active).toBe(20);
    expect(layer.stats().families.burst.active).toBe(0);
    layer.dispose();
  });

  it('protects terminal and ammunition bursts from later decoration', () => {
    const layer = new TracerLayer();
    for (let cue = 0; cue < 64; cue += 1) {
      layer.burst({ x: cue, y: 0 }, 0, 'terminal', 0xff6b38, 1);
      layer.burst({ x: cue, y: 20 }, 0, 'ammo', 0xffa34f, 1);
    }
    layer.burst({ x: 0, y: 0 }, 0, 'miss', 0xffffff, 1);

    expect(layer.stats().families.burst).toMatchObject({
      active: 128,
      dropped: 1,
      evicted: 0,
    });
    layer.dispose();
  });

  it('tears down every GPU owner exactly once', () => {
    const layer = new TracerLayer();
    layer.fire(new Vector3(), { x: 100, y: 0 }, visual('missile'), 6, 500, 0xffffff, () => 0);
    layer.spawnSmoke({ x: 0, y: 0 }, 0);
    const owned = resources(layer);
    const meshes = layer.group.children.filter((node): node is InstancedMesh => (
      node instanceof InstancedMesh
    ));
    const geometryDisposals = vi.fn();
    const materialDisposals = vi.fn();
    const instanceDisposals = vi.fn();
    owned.geometries.forEach((geometry) => geometry.addEventListener('dispose', geometryDisposals));
    owned.materials.forEach((material) => material.addEventListener('dispose', materialDisposals));
    meshes.forEach((mesh) => mesh.addEventListener('dispose', instanceDisposals));

    layer.dispose();
    layer.dispose();

    expect(instanceDisposals).toHaveBeenCalledTimes(meshes.length);
    expect(geometryDisposals).toHaveBeenCalledTimes(owned.geometries.size);
    expect(materialDisposals).toHaveBeenCalledTimes(owned.materials.size);
    expect(layer.group.children).toHaveLength(0);
    expect(layer.stats().active).toBe(0);
    expect(() => layer.update(1)).not.toThrow();
    expect(() => layer.setPresentationMode(true, true)).not.toThrow();
  });

  it('keeps concurrent layers from sharing projectile geometry owners', () => {
    const first = new TracerLayer();
    const second = new TracerLayer();
    const firstMissile = first.group.getObjectByName('shot-missile') as InstancedMesh;
    const secondMissile = second.group.getObjectByName('shot-missile') as InstancedMesh;
    const firstDisposed = vi.fn();
    const secondDisposed = vi.fn();
    firstMissile.geometry.addEventListener('dispose', firstDisposed);
    secondMissile.geometry.addEventListener('dispose', secondDisposed);

    expect(firstMissile.geometry).not.toBe(secondMissile.geometry);
    first.dispose();
    expect(firstDisposed).toHaveBeenCalledTimes(1);
    expect(secondDisposed).not.toHaveBeenCalled();

    second.fire(
      new Vector3(0, 14, 0),
      { x: 100, y: 0 },
      visual('missile'),
      2,
      500,
      0xffffff,
      () => 0,
    );
    second.update(0.05);
    expect(second.stats().families.missile.active).toBe(2);

    second.dispose();
    second.dispose();
    expect(secondDisposed).toHaveBeenCalledTimes(1);
  });
});
