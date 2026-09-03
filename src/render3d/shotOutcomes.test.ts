import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { testWorld } from '../../tests/support';
import type { SimEvent } from '../sim/events';
import type { Projectile } from '../sim/types';
import { missCueAngle, missCueDistance } from './battleEventPresentation';
import { ShotOutcomeIndex } from './shotOutcomes';
import { TracerLayer } from './tracers';

function projectile(hit: boolean, impactTick: number, weaponId = 'ac5'): Projectile {
  return {
    shooterId: 1, targetId: 2, weaponId, hit, from: { x: 0, y: 0 },
    calledShot: null, damage: 5, impactTick,
  };
}

const FIRED: Extract<SimEvent, { type: 'weapon_fired' }> = {
  type: 'weapon_fired', tick: 10, shooterId: 1, targetId: 2, weaponId: 'ac5',
};

function positionAt(layer: TracerLayer, name: string, index = 0): Vector3 {
  const mesh = layer.group.getObjectByName(`shot-${name}`);
  if (mesh === undefined || !('getMatrixAt' in mesh)) throw new Error(`no pool ${name}`);
  const matrix = new Matrix4();
  (mesh as { getMatrixAt(index: number, matrix: Matrix4): void }).getMatrixAt(index, matrix);
  return new Vector3().setFromMatrixPosition(matrix);
}

describe('shot outcomes read from the simulation', () => {
  it('claims each travelling round once, in firing order, and keys the miss point to its impact tick', () => {
    const world = testWorld('shot-outcomes');
    world.projectiles = [projectile(true, 14), projectile(false, 14), projectile(true, 19)];
    const index = new ShotOutcomeIndex();
    index.begin([]);

    const first = index.take(world, FIRED);
    expect(first?.rounds.map((round) => round.hit)).toEqual([true]);
    const second = index.take(world, FIRED);
    expect(second?.rounds.map((round) => round.hit)).toEqual([false]);
    const miss = second?.rounds[0];
    const cue = { tick: 14, targetId: 2, weaponId: 'ac5' };
    expect(miss?.missX).toBeCloseTo(Math.cos(missCueAngle(cue)) * missCueDistance(cue));
    expect(miss?.missY).toBeCloseTo(Math.sin(missCueAngle(cue)) * missCueDistance(cue));

    const third = index.take(world, { ...FIRED, tick: 15 });
    expect(third?.rounds.map((round) => round.hit)).toEqual([true]);
    expect(index.take(world, { ...FIRED, tick: 16 })).toBeNull();
  });

  it('reads instant weapons off the same batch of hit and miss events', () => {
    const world = testWorld('instant-outcomes');
    const index = new ShotOutcomeIndex();
    const laser = { ...FIRED, weaponId: 'medium_laser' };
    index.begin([
      { type: 'projectile_miss', tick: 10, shooterId: 1, targetId: 2, weaponId: 'medium_laser' },
      { type: 'projectile_hit', tick: 10, shooterId: 1, targetId: 2, weaponId: 'medium_laser',
        location: 'left_arm', damage: 5, arc: 'front' },
    ]);
    expect(index.take(world, laser)?.rounds.map((round) => round.hit)).toEqual([false]);
    expect(index.take(world, laser)?.rounds.map((round) => round.hit)).toEqual([true]);
    expect(index.take(world, laser)).toBeNull();
    // A ballistic hit landing this tick is never mistaken for this tick's launch.
    expect(index.take(world, FIRED)).toBeNull();
  });

  it('flies a known miss at its own dirt from launch and retires it there on the miss event', () => {
    const layer = new TracerLayer();
    const engagement = { shooterId: 1, targetId: 2, weaponId: 'ac5' };
    const outcome = { rounds: [{ hit: false, missX: 30, missY: 0 }] };
    layer.fire(
      new Vector3(0, 14, 0), { x: 100, y: 0 },
      { style: 'tracer', colour: '#ffffff', width: 2, arc: 0 },
      1, 500, 0xffffff, () => 0, engagement, 1, null, outcome,
    );
    layer.update(0.5, (_id, out) => {
      out.set(100, 14, 0);
      return true;
    });
    const midway = positionAt(layer, 'shell');
    expect(midway.x).toBeCloseTo(65);
    expect(midway.y).toBeCloseTo(7);

    expect(layer.resolveProjectile(engagement, new Vector3(130, 0, 0), true)).toBe(true);
    expect(positionAt(layer, 'shell').toArray()).toEqual([130, 0, 0]);
    layer.dispose();
  });

  it('ends a missed beam in the ground beside the target instead of on its chest', () => {
    const layer = new TracerLayer();
    layer.fire(
      new Vector3(0, 14, 0), { x: 100, y: 0 },
      { style: 'beam', colour: '#ffffff', width: 2, arc: 0 },
      1, null, 0xffffff, () => 0, null, null, null,
      { rounds: [{ hit: false, missX: 0, missY: 20 }] },
    );
    const midpoint = positionAt(layer, 'beam');
    expect(midpoint.z).toBeCloseTo(10);
    expect(midpoint.y).toBeCloseTo(7);
    layer.dispose();
  });
});
