import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import type { Faction } from '../schema/faction';
import { advanceWeaponRecoil, triggerWeaponRecoil } from './weaponModels';
import { createWeaponRig } from './weaponMotion';

function rig(nativeFaction: Faction = 'linewrought') {
  const slide = new Group();
  const muzzle = new Object3D();
  const breech = new Object3D();
  const feed = new Object3D();
  const aperture = new Object3D();
  feed.position.x = -2;
  return createWeaponRig(
    'test_cannon',
    nativeFaction,
    { style: 'tracer', colour: '#ffffff', width: 2, arc: 0 },
    slide,
    muzzle,
    breech,
    0.8,
    {
      breechX: -2,
      muzzleX: 3,
      feed,
      feedTravel: 0.25,
      aperture,
      apertureTravel: 0.5,
    },
  );
}

describe('weapon motion', () => {
  it('cycles prebuilt slide, feed and aperture transforms without replacing them', () => {
    const weapon = rig();
    const slidePosition = weapon.slide.position;
    const feedPosition = weapon.feed?.position;
    const apertureScale = weapon.aperture?.scale;

    triggerWeaponRecoil(weapon);

    expect(weapon.slide.position.x).toBe(-0.8);
    expect(weapon.feed?.position.x).toBe(-2.25);
    expect(weapon.aperture?.scale.toArray()).toEqual([1, 0.5, 0.5]);
    for (let frame = 0; frame < 240; frame += 1) advanceWeaponRecoil(weapon, 1 / 60);
    expect(weapon.slide.position).toBe(slidePosition);
    expect(weapon.feed?.position).toBe(feedPosition);
    expect(weapon.aperture?.scale).toBe(apertureScale);
    expect(weapon.kick).toBe(0);
    expect(weapon.cycle).toBe(0);
    expect(weapon.slide.position.x).toBe(0);
    expect(weapon.feed?.position.x).toBe(-2);
    expect(weapon.aperture?.scale.toArray()).toEqual([1, 1, 1]);
  });

  it('retains the stronger in-flight kick and ignores negative time', () => {
    const weapon = rig();
    triggerWeaponRecoil(weapon);
    weapon.kick = 1.2;
    const before = weapon.kick;
    triggerWeaponRecoil(weapon);
    expect(weapon.kick).toBe(before);
    advanceWeaponRecoil(weapon, -1);
    expect(weapon.kick).toBe(before);
    advanceWeaponRecoil(weapon, Number.NaN);
    expect(weapon.kick).toBe(before);
    expect(Number.isFinite(weapon.slide.position.x)).toBe(true);
  });

  it('presents a sealed aperture once before low-FX damping settles it', () => {
    const weapon = rig('aurelian');

    triggerWeaponRecoil(weapon);

    expect(weapon.kick).toBe(0);
    expect(weapon.slide.position.x).toBe(0);
    expect(weapon.cycle).toBe(1);
    expect(weapon.aperture?.scale.y).toBe(0.5);
    advanceWeaponRecoil(weapon, 0.25, false, true);
    expect(weapon.cycle).toBe(1);
    expect(weapon.aperture?.scale.y).toBe(0.5);
    advanceWeaponRecoil(weapon, 1 / 60, false, true);
    expect(weapon.cycle).toBeGreaterThan(0);
    expect(weapon.cycle).toBeLessThan(1);
    expect(weapon.aperture?.scale.y).toBeGreaterThan(0.5);
    advanceWeaponRecoil(weapon, 1, false, true);
    expect(weapon.cycle).toBe(0);
    expect(weapon.aperture?.scale.y).toBe(1);
  });

  it('presents a firing cycle once before reduced-motion damping begins', () => {
    const weapon = rig('aurelian');

    triggerWeaponRecoil(weapon);
    advanceWeaponRecoil(weapon, 0.25, true);
    expect(weapon.cycle).toBe(1);
    expect(weapon.aperture?.scale.y).toBe(0.5);

    advanceWeaponRecoil(weapon, 1 / 60, true);
    expect(weapon.cycle).toBeGreaterThan(0);
    expect(weapon.cycle).toBeLessThan(1);
  });

  it('spins a barrel bank forwards through repeated shots without snapping backwards', () => {
    const weapon = rig();
    weapon.feedKind = 'spin';
    weapon.feedTravel = Math.PI * 2;
    const feed = weapon.feed;
    expect(feed).not.toBeNull();
    if (feed === null) return;

    triggerWeaponRecoil(weapon);
    expect(feed.rotation.x).toBe(0);
    advanceWeaponRecoil(weapon, 1 / 60);
    advanceWeaponRecoil(weapon, 1 / 60);
    const first = feed.rotation.x;
    expect(first).toBeGreaterThan(0);
    triggerWeaponRecoil(weapon);
    expect(feed.rotation.x).toBe(first);
    for (let frame = 0; frame < 240; frame += 1) advanceWeaponRecoil(weapon, 1 / 60);
    expect(feed.rotation.x).toBeGreaterThan(first);
    const settled = feed.rotation.x;
    advanceWeaponRecoil(weapon, 1);
    expect(feed.rotation.x).toBe(settled);
  });
  it('energises prebuilt emitter materials on fire and returns to their original idle glow', () => {
    const root = new Group();
    const material = new MeshStandardMaterial({ emissive: 0x44ccff, emissiveIntensity: 0.7 });
    const geometry = new BoxGeometry(1, 1, 1);
    root.add(new Mesh(geometry, material), new Mesh(geometry, material));
    const weapon = createWeaponRig('beam', 'aurelian',
      { style: 'beam', colour: '#44ccff', width: 1, arc: 0 }, root, new Object3D(), new Object3D(), 0,
      { breechX: 0, muzzleX: 1 });
    expect(weapon.powerMaterials).toHaveLength(1);
    triggerWeaponRecoil(weapon);
    expect(material.emissiveIntensity).toBeCloseTo(0.7 * 2.8);
    for (let frame = 0; frame < 240; frame += 1) advanceWeaponRecoil(weapon, 1 / 60);
    expect(material.emissiveIntensity).toBe(0.7);
    geometry.dispose(); material.dispose();
  });

  it('keeps disabled emitter cores dark through future presentation frames', () => {
    const root = new Group();
    const material = new MeshStandardMaterial({ emissive: 0x44ccff, emissiveIntensity: 0.7 });
    const geometry = new BoxGeometry(1, 1, 1);
    root.add(new Mesh(geometry, material));
    const weapon = createWeaponRig('beam', 'aurelian',
      { style: 'beam', colour: '#44ccff', width: 1, arc: 0 }, root, new Object3D(), new Object3D(), 0,
      { breechX: 0, muzzleX: 1 }, false);
    expect(material.emissiveIntensity).toBe(0);
    expect(material.color.r).toBeCloseTo(0.12);
    triggerWeaponRecoil(weapon);
    advanceWeaponRecoil(weapon, 1);
    expect(material.emissiveIntensity).toBe(0);
    geometry.dispose(); material.dispose();
  });

});
