import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import type { LocationAnchors } from './locationAnchors';
import {
  advanceHullSurface,
  createHullSurface,
  flashHullLocation,
  setHullHeatGlow,
} from './hullSurface';

function anchors(): { anchors: LocationAnchors; shared: MeshStandardMaterial; root: Group } {
  const shared = new MeshStandardMaterial({ color: 0x777777 });
  const root = new Group();
  const arm = new Mesh(new BoxGeometry(), shared);
  const torso = new Mesh(new BoxGeometry(), shared);
  const other = new Mesh(new BoxGeometry(), shared);
  root.add(arm, torso, other);
  return { anchors: { left_arm: [arm], centre_torso: [torso] }, shared, root };
}

describe('struck plate flash and reactor glow', () => {
  it('lights only the struck location on a cloned material and restores it afterwards', () => {
    const { anchors: parts, shared } = anchors();
    const rig = createHullSurface();
    expect(flashHullLocation(rig, parts, 'left_arm', 1, 0, 0.2)).toBe(true);
    advanceHullSurface(rig, 0);

    const arm = parts.left_arm?.[0];
    const torso = parts.centre_torso?.[0];
    expect(arm?.material).not.toBe(shared);
    expect(torso?.material).toBe(shared);
    const lit = arm?.material as MeshStandardMaterial;
    expect(lit.emissive.b).toBeGreaterThan(lit.emissive.r);
    expect(lit.emissiveIntensity).toBeGreaterThanOrEqual(1);
    expect(shared.emissive.getHex()).toBe(0);

    advanceHullSurface(rig, 0.5);
    expect(lit.emissive.getHex()).toBe(0);
    expect(lit.emissiveIntensity).toBe(shared.emissiveIntensity);
  });

  it('flashes armour cold and structure hot', () => {
    const { anchors: parts } = anchors();
    const cold = createHullSurface();
    const hot = createHullSurface();
    flashHullLocation(cold, parts, 'left_arm', 1, 0, 0.3);
    advanceHullSurface(cold, 0);
    const coldColour = (parts.left_arm?.[0]?.material as MeshStandardMaterial).emissive.clone();
    flashHullLocation(hot, parts, 'left_arm', 1, 1, 0.3);
    advanceHullSurface(hot, 0);
    const hotColour = (parts.left_arm?.[0]?.material as MeshStandardMaterial).emissive;
    expect(coldColour.b).toBeGreaterThan(coldColour.r);
    expect(hotColour.r).toBeGreaterThan(hotColour.b);
  });

  it('never allocates a second clone for a location and does not fail on unknown ones', () => {
    const { anchors: parts } = anchors();
    const rig = createHullSurface();
    flashHullLocation(rig, parts, 'left_arm', 0.5, 0, 0.2);
    const first = parts.left_arm?.[0]?.material;
    flashHullLocation(rig, parts, 'left_arm', 0.9, 1, 0.2);
    expect(parts.left_arm?.[0]?.material).toBe(first);
    expect(flashHullLocation(rig, parts, 'head', 1, 0, 0.2)).toBe(false);
  });

  it('glows the torso with reactor heat and clears it when the heat is gone', () => {
    const { anchors: parts } = anchors();
    const rig = createHullSurface();
    setHullHeatGlow(rig, parts, 0.8);
    advanceHullSurface(rig, 0.1);
    const torso = parts.centre_torso?.[0]?.material as MeshStandardMaterial;
    expect(torso.emissive.r).toBeGreaterThan(0);
    expect(parts.left_arm?.[0]?.material).toBeInstanceOf(MeshStandardMaterial);
    expect(rig.entries.has('left_arm')).toBe(false);
    setHullHeatGlow(rig, parts, 0);
    advanceHullSurface(rig, 0.1);
    expect(torso.emissive.getHex()).toBe(0);
  });
});
