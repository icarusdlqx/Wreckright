import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { collectLocationAnchors, locationWorldAnchor } from './locationAnchors';
import { locationContactAnchor } from './locationContactAnchor';

function plate(x = 0, z = 0): Mesh {
  const mesh = new Mesh(new BoxGeometry(4, 6, 8), new MeshBasicMaterial());
  mesh.position.set(x, 10, z); mesh.userData.damageLocation = 'centre_torso';
  return mesh;
}

describe('struck component surface contact', () => {
  it('puts either incoming direction outside the armour while readouts retain their centre', () => {
    const root = new Group(); root.add(plate());
    const anchors = collectLocationAnchors(root), out = new Vector3();
    expect(locationContactAnchor(anchors, 'centre_torso', 0, out)).toBe(true);
    expect(out.x).toBeCloseTo(-2.65); expect(out.y).toBe(10); expect(out.z).toBe(0);
    expect(locationContactAnchor(anchors, 'centre_torso', Math.PI, out)).toBe(true);
    expect(out.x).toBeCloseTo(2.65);
    locationWorldAnchor(anchors, 'centre_torso', out);
    expect(out.toArray()).toEqual([0, 10, 0]);
  });

  it('follows the actual translated and rotated joint, including scaled geometry', () => {
    const root = new Group(); const joint = new Group(); joint.add(plate()); root.add(joint);
    root.position.set(100, 5, 20); joint.rotation.y = Math.PI / 2; joint.scale.z = 2;
    const anchors = collectLocationAnchors(root), out = new Vector3();
    expect(locationContactAnchor(anchors, 'centre_torso', 0, out)).toBe(true);
    expect(out.x).toBeCloseTo(91.35); expect(out.y).toBe(15); expect(out.z).toBeCloseTo(20);
    joint.rotation.y = 0;
    locationContactAnchor(anchors, 'centre_torso', 0, out);
    expect(out.x).toBeCloseTo(97.35);
  });

  it('chooses the first struck plate rather than a plate buried behind it', () => {
    const root = new Group(); root.add(plate(-7), plate(7));
    const out = new Vector3();
    locationContactAnchor(collectLocationAnchors(root), 'centre_torso', 0, out);
    expect(out.x).toBeCloseTo(-9.65);
  });

  it('resolves an open frame gap against a real part without spanning the empty space', () => {
    const root = new Group(); root.add(plate(0, -10), plate(0, 10));
    const out = new Vector3();
    expect(locationContactAnchor(collectLocationAnchors(root), 'centre_torso', 0, out)).toBe(true);
    expect(out.x).toBeCloseTo(-2.65); expect(Math.abs(out.z)).toBe(10);
  });

  it('leaves a missing or shed component to the existing render-safe fallback', () => {
    const out = new Vector3(7, 8, 9);
    expect(locationContactAnchor({}, 'left_arm', 0, out)).toBe(false);
    expect(out.toArray()).toEqual([7, 8, 9]);
  });
});
