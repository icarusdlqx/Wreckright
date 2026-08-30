import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import type { SimEvent } from '../sim/events';
import type { MechEntity, World } from '../sim/types';
import { BattleIntensity } from './audioScore';

function silentWorld(seed: string): World {
  const world = playerWorld(seed);
  world.tick = 0;
  for (const entity of world.entities) entity.motion = 'stationary';
  world.vision?.visible.clear();
  world.vision?.identified.clear();
  world.vision?.detected.clear();
  world.vision?.tracks.clear();
  return world;
}

function teams(world: World): { ally: MechEntity; enemies: MechEntity[] } {
  const playerTeam = world.playerTeam ?? 0;
  const ally = world.entities.find((entity) => entity.team === playerTeam);
  const enemies = world.entities.filter((entity) => entity.team !== playerTeam);
  if (ally === undefined || enemies.length < 2) throw new Error('score test needs two teams');
  return { ally, enemies };
}

function fired(world: World, shooter: MechEntity): Extract<SimEvent, { type: 'weapon_fired' }> {
  const target = world.entities.find((entity) => entity.team !== shooter.team);
  const weapon = shooter.weapons.find((mount) => world.catalog.weapons.has(mount.weaponId));
  if (target === undefined || weapon === undefined) throw new Error('score test needs an armed target');
  return {
    type: 'weapon_fired',
    tick: world.tick,
    shooterId: shooter.id,
    targetId: target.id,
    weaponId: weapon.weaponId,
  };
}

function detect(world: World, enemy: MechEntity, source: 'sensor' | 'optical'): void {
  const vision = world.vision;
  if (vision === null) throw new Error('score test needs player vision');
  vision.detected.add(enemy.id);
  if (source === 'optical') {
    vision.visible.add(enemy.id);
    vision.identified.add(enemy.id);
  }
  vision.tracks.set(enemy.id, {
    id: enemy.id,
    team: enemy.team,
    frame: enemy.frame,
    chassisClass: enemy.chassisClass,
    pos: { ...enemy.pos },
    tick: world.tick,
    source,
  });
}

describe('battle intensity', () => {
  it('holds quiet at zero and uses movement and contact floors', () => {
    const quiet = silentWorld('score-floors-quiet');
    expect(new BattleIntensity().advance(quiet, [])).toBe(0);

    const moving = silentWorld('score-floors-moving');
    for (const entity of moving.entities) {
      if (entity.team === moving.playerTeam) entity.motion = 'walk';
    }
    expect(new BattleIntensity().advance(moving, [])).toBeCloseTo(0.24);

    const sensor = silentWorld('score-floors-sensor');
    detect(sensor, teams(sensor).enemies[0]!, 'sensor');
    expect(new BattleIntensity().advance(sensor, [])).toBeCloseTo(0.3);

    const optical = silentWorld('score-floors-optical');
    detect(optical, teams(optical).enemies[0]!, 'optical');
    expect(new BattleIntensity().advance(optical, [])).toBeCloseTo(0.38);
  });

  it('seeds existing contacts without a spike and prices a later contact once', () => {
    const world = silentWorld('score-new-contact');
    const intensity = new BattleIntensity();
    const { enemies } = teams(world);
    detect(world, enemies[0]!, 'sensor');
    expect(intensity.advance(world, [])).toBeCloseTo(0.3);

    detect(world, enemies[1]!, 'sensor');
    expect(intensity.advance(world, [])).toBeCloseTo(0.384);
    expect(intensity.advance(world, [])).toBeCloseTo(0.384);
  });

  it('keeps hidden hostile motion and fire out of the score', () => {
    const world = silentWorld('score-hidden-hostile');
    const intensity = new BattleIntensity();
    const enemy = teams(world).enemies[0]!;
    enemy.motion = 'run';

    expect(intensity.advance(world, [fired(world, enemy)])).toBe(0);
  });

  it('decays on simulation ticks, holds through a pause, and resets on a rewind', () => {
    const world = silentWorld('score-decay');
    const intensity = new BattleIntensity();
    const event = fired(world, teams(world).ally);
    const peak = intensity.advance(world, [event]);
    expect(peak).toBeCloseTo(0.08);
    expect(intensity.advance(world, [])).toBe(peak);

    world.tick += Math.round(4.5 / world.dt);
    expect(intensity.advance(world, [])).toBeCloseTo(peak / 2, 5);

    world.tick = 0;
    expect(intensity.advance(world, [])).toBe(0);
  });

  it('builds a sustained volley, reserves the future full layer, and clamps floods', () => {
    const singleWorld = silentWorld('score-single');
    const singleEvent = fired(singleWorld, teams(singleWorld).ally);
    const single = new BattleIntensity().advance(singleWorld, [singleEvent]);

    const volleyWorld = silentWorld('score-volley');
    const volleyEvent = fired(volleyWorld, teams(volleyWorld).ally);
    const volley = new BattleIntensity().advance(
      volleyWorld,
      Array.from({ length: 8 }, () => ({ ...volleyEvent })),
    );
    expect(volley).toBeGreaterThan(single);

    const criticalWorld = silentWorld('score-critical');
    const { ally, enemies } = teams(criticalWorld);
    detect(criticalWorld, enemies[0]!, 'optical');
    const critical = new BattleIntensity().advance(criticalWorld, [{
      type: 'critical_hit',
      tick: criticalWorld.tick,
      entityId: ally.id,
      shooterId: enemies[0]!.id,
      location: 'centre_torso',
      component: 'gyro',
    }]);
    expect(critical).toBeGreaterThan(0.68);

    const floodWorld = silentWorld('score-flood');
    const floodEvent = fired(floodWorld, teams(floodWorld).ally);
    expect(new BattleIntensity().advance(
      floodWorld,
      Array.from({ length: 10_000 }, () => ({ ...floodEvent })),
    )).toBeLessThanOrEqual(1);
  });

  it('is exactly deterministic for an identical world-tick and event sequence', () => {
    const leftWorld = silentWorld('score-deterministic');
    const rightWorld = silentWorld('score-deterministic');
    const left = new BattleIntensity();
    const right = new BattleIntensity();
    const leftAlly = teams(leftWorld).ally;
    const rightAlly = teams(rightWorld).ally;

    for (const tick of [0, 1, 5, 21, 55, 120]) {
      leftWorld.tick = tick;
      rightWorld.tick = tick;
      const leftEvents = tick % 2 === 0 ? [fired(leftWorld, leftAlly)] : [];
      const rightEvents = tick % 2 === 0 ? [fired(rightWorld, rightAlly)] : [];
      expect(left.advance(leftWorld, leftEvents)).toBe(right.advance(rightWorld, rightEvents));
    }
  });
});
