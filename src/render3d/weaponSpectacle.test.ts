import { Box3, BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { TracerLayer } from './tracers';
import { DetachedPartPool } from './detachedPartPool';

function mesh(layer: TracerLayer, name: string): InstancedMesh {
  const result = layer.group.getObjectByName(`shot-${name}`);
  if (!(result instanceof InstancedMesh)) throw new Error(`Missing ${name}`);
  return result;
}
function matrix(batch: InstancedMesh, index = 0): Matrix4 { const result = new Matrix4(); batch.getMatrixAt(index, result); return result; }
function visible(batch: InstancedMesh): number {
  let total = 0;
  for (let index = 0; index < batch.count; index += 1) if (matrix(batch, index).getMaxScaleOnAxis() > .001) total += 1;
  return total;
}
const engagement = { shooterId: 1, targetId: 2, weaponId: 'test' };
const missile = { style: 'missile' as const, colour: '#ffffff', width: 3, arc: 25 };

describe('readable weapon and destruction details', () => {
  it('keeps the white beam core aligned to the exact contact and retires both layers together', () => {
    const layer = new TracerLayer();
    try {
      layer.fire(new Vector3(10, 20, 30), { x: 100, y: 80 },
        { ...missile, style: 'beam', arc: 0 }, 1, null, 0x66aaff, () => 0, engagement);
      const endpoint = new Vector3(85, 44, 55);
      layer.resolveProjectile(engagement, endpoint);
      for (const name of ['beam', 'beam-core']) {
        expect(new Vector3(0, .5, 0).applyMatrix4(matrix(mesh(layer, name))).distanceTo(endpoint)).toBeLessThan(.001);
      }
      expect(matrix(mesh(layer, 'beam-core')).getMaxScaleOnAxis()).toBeGreaterThan(0);
      layer.update(.3);
      expect(visible(mesh(layer, 'beam'))).toBe(0);
      expect(visible(mesh(layer, 'beam-core'))).toBe(0);
    } finally { layer.dispose(); }
  });

  it('keeps missile exhaust hidden during private flight and removes it at impact', () => {
    const layer = new TracerLayer();
    try {
      layer.fire(new Vector3(100, 14, 0), { x: 154, y: 0 }, missile, 1, 200, 0xffffff,
        () => 0, engagement, 2.7, .27);
      const wake = mesh(layer, 'missile-wake');
      layer.update(2.42); expect(visible(wake)).toBe(0);
      layer.update(.145); expect(visible(wake)).toBeGreaterThan(1);
      for (let index = 0; index < wake.count; index += 1) {
        const transform = matrix(wake, index);
        if (transform.getMaxScaleOnAxis() > .001) expect(new Vector3().setFromMatrixPosition(transform).x).toBeGreaterThanOrEqual(100);
      }
      layer.resolveProjectile(engagement, new Vector3(154, 14, 0));
      expect(visible(wake)).toBe(0);
    } finally { layer.dispose(); }
  });

  it('immediately hides existing extra detail in Low FX and keeps reduced-motion wakes off', () => {
    const layer = new TracerLayer();
    try {
      layer.fire(new Vector3(0, 14, 0), { x: 200, y: 0 }, missile, 3, 200, 0xffffff, () => 0);
      layer.update(.2);
      expect(visible(mesh(layer, 'missile-wake'))).toBeGreaterThan(0);
      layer.setPresentationMode(true, false);
      expect(mesh(layer, 'missile-wake').visible).toBe(false);
      expect(mesh(layer, 'beam-core').visible).toBe(false);
      expect(mesh(layer, 'armour-fragments').visible).toBe(false);
      layer.setPresentationMode(false, true);
      expect(mesh(layer, 'missile-wake').visible).toBe(false);
      expect(mesh(layer, 'armour-fragments').visible).toBe(false);
    } finally { layer.dispose(); }
  });

  it('fades flame to transparency without an opaque black lobe near expiry', () => {
    const layer = new TracerLayer();
    try {
      layer.fire(new Vector3(0, 14, 0), { x: 100, y: 0 }, { ...missile, style: 'flame' },
        1, null, 0xffaa44, () => 0);
      const flame = mesh(layer, 'flame');
      const alpha = flame.geometry.getAttribute('flameOpacity');
      const initial = alpha.getX(0), initialRed = flame.instanceColor!.getX(0);
      layer.update(.291);
      expect(visible(flame)).toBeGreaterThan(0);
      expect(alpha.getX(0)).toBeGreaterThan(0);
      expect(alpha.getX(0)).toBeLessThan(initial * .03);
      expect(flame.instanceColor!.getX(0)).toBe(initialRed);
      layer.update(.01);
      expect(visible(flame)).toBe(0);
      expect(visible(mesh(layer, 'flame-core'))).toBe(0);
    } finally { layer.dispose(); }
  });

  it('grounds a high torso blast on the actual terrain and expires every fracture batch', () => {
    const layer = new TracerLayer();
    try {
      layer.burst({ x: 20, y: 40 }, 56, 'terminal', 0xff7733, 1.5, 'generic', 0, 8);
      expect(new Vector3().setFromMatrixPosition(matrix(mesh(layer, 'contact-flare'))).y).toBeCloseTo(8.3);
      expect(visible(mesh(layer, 'armour-fragments'))).toBe(6);
      layer.update(.6);
      const shards = mesh(layer, 'armour-fragments');
      for (let index = 0; index < 6; index += 1) expect(new Vector3().setFromMatrixPosition(matrix(shards, index)).y).toBeGreaterThanOrEqual(8.3);
      layer.update(1);
      for (const name of ['armour-fragments', 'blast-lobes', 'contact-flare', 'burst']) expect(visible(mesh(layer, name))).toBe(0);
    } finally { layer.dispose(); }
  });

  it('lets a severed arm bounce, then settle on its rotated surface instead of sinking to its centre', () => {
    const scene = new Scene(), source = new Group();
    const part = new Mesh(new BoxGeometry(3, 8, 3), new MeshStandardMaterial());
    part.userData.damageLocation = 'left_arm'; source.add(part); source.position.set(0, 18, 0);
    const pool = new DetachedPartPool(scene, () => 4, false);
    try {
      pool.spawn(source, 'left_arm', 2);
      const detached = scene.children.find((child) => child.visible)!;
      let bounced = false, previousHeight = detached.position.y, descending = false;
      for (let frame = 0; frame < 240; frame += 1) {
        pool.advance(1 / 60); detached.updateMatrixWorld(true);
        const height = detached.position.y;
        if (height < previousHeight) descending = true;
        if (descending && height > previousHeight + .02) bounced = true;
        expect(new Box3().setFromObject(detached).min.y).toBeGreaterThanOrEqual(3.999);
        previousHeight = height;
      }
      expect(bounced).toBe(true);
      expect(new Box3().setFromObject(detached).min.y).toBeCloseTo(4.25, 1);
    } finally { pool.dispose(); part.geometry.dispose(); (part.material as MeshStandardMaterial).dispose(); }
  });
});
