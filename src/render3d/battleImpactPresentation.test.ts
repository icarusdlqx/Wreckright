import { Color, InstancedMesh, Scene } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testWorld, unitOf } from '../../tests/support';
import type { SimEvent } from '../sim/events';
import { BattleEffects } from './battleEffects';
import { TacticalCamera } from './camera';
import { TracerLayer } from './tracers';
import { UnitViews } from './unitViews';
import { triggerStaggerJolt, hullJoltSway, advanceHullRecoil, machineCulture } from './machineCulture';

function effects(scene: Scene, reducedMotion = false): BattleEffects {
  return new BattleEffects(
    scene,
    new Color(0x101820),
    new TacticalCamera(reducedMotion),
    () => 0,
    () => ({ x: 120, y: 80 }),
    () => false,
    {
      anchorOf: (_id, _location, out) => {
        out.set(120, 18, 80);
        return true;
      },
      currentPositionOf: () => ({ x: 120, y: 80 }),
    },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('impact presentation by family and event', () => {
  it('tags hits and misses with the weapon family that caused them', () => {
    const burst = vi.spyOn(TracerLayer.prototype, 'burst').mockImplementation(() => undefined);
    const world = testWorld('family-bursts');
    const feedback = effects(new Scene());
    const events: SimEvent[] = [
      { type: 'projectile_hit', tick: 3, shooterId: 1, targetId: 2, weaponId: 'medium_laser',
        location: 'left_arm', damage: 5, arc: 'front' },
      { type: 'projectile_hit', tick: 3, shooterId: 1, targetId: 2, weaponId: 'srm6',
        location: 'left_arm', damage: 2, arc: 'front' },
      { type: 'projectile_miss', tick: 3, shooterId: 1, targetId: 2, weaponId: 'gauss_rifle' },
      { type: 'projectile_miss', tick: 3, shooterId: 1, targetId: 2, weaponId: 'flamer' },
    ];
    feedback.consume(world, events);
    expect(burst.mock.calls.map((call) => [call[2], call[5]])).toEqual([
      ['hit', 'energy'], ['hit', 'missile'], ['miss', 'kinetic'], ['miss', 'flame'],
    ]);
    feedback.destroy();
  });

  it('delays the impact read of a travelling charge by its authored speed', () => {
    const burst = vi.spyOn(TracerLayer.prototype, 'burst').mockImplementation(() => undefined);
    const world = testWorld('charge-delay');
    const feedback = new BattleEffects(
      new Scene(), new Color(0x101820), new TacticalCamera(false), () => 0,
      (id) => (id === 1 ? { x: 0, y: 0 } : { x: 180, y: 0 }), () => false,
      { anchorOf: (_id, _location, out) => { out.set(180, 18, 0); return true; } },
    );
    feedback.consume(world, [{
      type: 'projectile_hit', tick: 3, shooterId: 1, targetId: 2, weaponId: 'ppc',
      location: 'centre_torso', damage: 17, arc: 'front',
    }]);
    const speed = world.catalog.weapons.get('ppc')?.visual.speed ?? 0;
    expect(speed).toBeGreaterThan(0);
    expect(burst.mock.calls[0]?.[6]).toBeCloseTo(180 / speed);
    feedback.destroy();
  });

  it('answers an artillery shell with a column, smoke and a camera thump', () => {
    const burst = vi.spyOn(TracerLayer.prototype, 'burst').mockImplementation(() => undefined);
    const smoke = vi.spyOn(TracerLayer.prototype, 'spawnSmoke').mockImplementation(() => undefined);
    const world = testWorld('artillery-impact');
    const camera = new TacticalCamera(false);
    const feedback = new BattleEffects(
      new Scene(), new Color(0x101820), camera, () => 0,
      () => ({ x: 120, y: 80 }), () => false,
    );
    camera.centreOn({ x: 100, y: 100 });
    feedback.consume(world, [{ type: 'ground_impact', tick: 4, kind: 'artillery', team: 0, x: 100, y: 100 }]);
    feedback.finishFrame(1 / 60);
    expect(burst.mock.calls[0]?.[2]).toBe('shell');
    expect(smoke).toHaveBeenCalledTimes(1);
    expect(camera.shake.length()).toBeGreaterThan(0);
    feedback.destroy();
  });

  it('launches a pod from the head on ejection and lets it fall back down', () => {
    const scene = new Scene();
    const world = testWorld('ejection-pod');
    const feedback = effects(scene);
    feedback.consume(world, [{ type: 'pilot_ejected', tick: 5, entityId: 2 }]);
    expect(feedback.pods.active).toBe(1);
    const pods = scene.getObjectByName('ejection-pods');
    expect(pods).toBeInstanceOf(InstancedMesh);
    feedback.advance(0.5);
    const matrix = (pods as InstancedMesh).instanceMatrix.array;
    const yAfterHalfSecond = matrix[13] ?? 0;
    expect(yAfterHalfSecond).toBeGreaterThan(18);
    feedback.advance(3);
    expect(feedback.pods.active).toBe(0);
    feedback.destroy();
  });

  it('jolts a staggered hull sideways and lets it settle', () => {
    const recoil = { kick: 0, travel: 0.2, jolt: 0, joltClock: 0 };
    triggerStaggerJolt(recoil, machineCulture('linewrought'));
    expect(recoil.jolt).toBeGreaterThan(0);
    advanceHullRecoil(recoil, 0.04);
    expect(Math.abs(hullJoltSway(recoil))).toBeGreaterThan(0);
    for (let frame = 0; frame < 240; frame += 1) advanceHullRecoil(recoil, 1 / 60);
    expect(recoil.jolt).toBe(0);
    expect(hullJoltSway(recoil)).toBe(0);

    const sealed = { kick: 0, travel: 0.2, jolt: 0, joltClock: 0 };
    triggerStaggerJolt(sealed, machineCulture('aurelian'));
    expect(sealed.jolt).toBeGreaterThan(0);
    expect(sealed.jolt).toBeLessThan(recoil.travel * 7);
  });

  it('routes a stagger event to a presented model and flashes the struck plate', () => {
    const world = testWorld('stagger-route');
    const entity = unitOf(world, 'hornet_spotter');
    const shooter = world.entities.find((other) => other.id !== entity.id);
    if (shooter === undefined) throw new Error('no shooter');
    const units = new UnitViews(new Scene(), () => 0);
    const view = units.viewFor(world, entity);
    units.viewFor(world, shooter);
    units.beginFrame(0);
    units.markPlaced(entity.id);
    units.markPlaced(shooter.id);

    units.consumeEvents(world, [
      { type: 'staggered', tick: 2, entityId: entity.id },
      { type: 'projectile_hit', tick: 2, shooterId: shooter.id, targetId: entity.id,
        weaponId: 'ac5', location: 'left_arm', damage: 6, arc: 'front' },
    ]);
    expect(view.model.hullRecoil.jolt).toBeGreaterThan(0);
    expect(view.surface.entries.get('left_arm')?.flash).toBeGreaterThan(0);
    units.dispose();
  });
});
