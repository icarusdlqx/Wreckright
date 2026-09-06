import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { callSupport } from './support';
import { quantizeTrackPosition, updateTeamVisions } from './sensors';
import { stepWorld } from './world';

function fixture() {
  const world = playerWorld('probe-tracking-lifetime');
  world.resources.set(0, 10_000);
  for (const entity of world.entities) {
    entity.pos = entity.team === 0 ? { x: 40, y: 40 } : { x: 600, y: 600 };
    entity.sensorRange = entity.sightRange = 0;
    entity.controller = 'orders';
    entity.groupEnabled.fill(false);
    entity.groupIntent.fill(false);
  }
  updateTeamVisions(world);
  const enemy = world.entities.find((entity) => entity.team === 1)!;
  const vision = world.vision!;
  return { world, enemy, vision };
}

describe('probe tracking through fog', () => {
  it('keeps an acquired moving enemy live outside coverage without revealing terrain or precise position', () => {
    const { world, enemy, vision } = fixture();
    const fog = vision.tiles.slice();
    const explored = vision.explored.slice();
    expect(callSupport(world, 0, 'sensor_probe', enemy.pos).ok).toBe(true);
    const first = { ...vision.tracks.get(enemy.id)!.pos };
    enemy.pos = { x: 901, y: 901 };
    world.tick += 1;
    updateTeamVisions(world);
    expect(vision.detected.has(enemy.id)).toBe(true);
    expect(vision.visible.has(enemy.id)).toBe(false);
    expect(vision.tracks.get(enemy.id)?.pos).toEqual(quantizeTrackPosition(enemy.pos, world.rules.sensors.trackGridMetres));
    expect(vision.tracks.get(enemy.id)?.pos).not.toEqual(first);
    expect(vision.tracks.get(enemy.id)?.pos).not.toEqual(enemy.pos);
    expect(vision.tiles).toEqual(fog);
    expect(vision.explored).toEqual(explored);
  });

  it('acquires new arrivals and gives overlapping probes independent lifetimes', () => {
    const { world, enemy, vision } = fixture();
    enemy.pos = { x: 900, y: 900 };
    expect(callSupport(world, 0, 'sensor_probe', { x: 300, y: 300 }).ok).toBe(true);
    expect(vision.detected.has(enemy.id)).toBe(false);
    enemy.pos = { x: 301, y: 301 };
    world.tick += 10;
    expect(callSupport(world, 0, 'sensor_probe', enemy.pos).ok).toBe(true);
    expect(world.reveals.every((sweep) => sweep.trackedIds?.includes(enemy.id))).toBe(true);
    enemy.pos = { x: 900, y: 900 };
    world.tick = world.reveals[0]!.expiresTick;
    updateTeamVisions(world);
    expect(vision.detected.has(enemy.id)).toBe(true);
    world.tick = world.reveals[1]!.expiresTick;
    updateTeamVisions(world);
    expect(vision.detected.has(enemy.id)).toBe(false);
  });

  it('ends live tracking on the exact expiry step and freezes the last known point', () => {
    const { world, enemy, vision } = fixture();
    callSupport(world, 0, 'sensor_probe', enemy.pos);
    world.tick = world.reveals[0]!.expiresTick - 1;
    updateTeamVisions(world);
    const last = structuredClone(vision.tracks.get(enemy.id));
    enemy.pos = { x: 900, y: 900 };
    stepWorld(world, world.rules.simulation.maxBattleTicks);
    expect(vision.detected.has(enemy.id)).toBe(false);
    expect(vision.visible.has(enemy.id)).toBe(false);
    expect(vision.tracks.get(enemy.id)).toEqual(last);
    expect(world.reveals).toHaveLength(0);
  });

  it('retains ordinary sensor and optical acquisition after the probe ends', () => {
    const { world, enemy, vision } = fixture();
    callSupport(world, 0, 'sensor_probe', enemy.pos);
    const friendly = world.entities.find((entity) => entity.team === 0)!;
    friendly.pos = { ...enemy.pos };
    friendly.sensorRange = friendly.sightRange = 200;
    world.tick = world.reveals[0]!.expiresTick;
    updateTeamVisions(world);
    expect(vision.visible.has(enemy.id)).toBe(true);
    expect(vision.detected.has(enemy.id)).toBe(true);
    expect(vision.tracks.get(enemy.id)?.source).toBe('optical');
  });
});
