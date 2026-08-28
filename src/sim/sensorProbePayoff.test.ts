import { describe, expect, it } from 'vitest';
import { playerWorld, unitOf } from '../../tests/support';
import { updateWeapons } from './combat';
import { eventsOfType } from './events';
import { updateTorso } from './movement';
import { issueAttack, updatePlayerControl } from './orders';
import { updateTeamVisions, visionFor, type TeamVision } from './sensors';
import { callSupport, updateSupport } from './support';
import type { MechEntity, Vec2, World } from './types';
import { stepWorld } from './world';

function sensorContact(
  world: World,
  shooter: MechEntity,
  target: MechEntity,
  point: Vec2 = target.pos,
): TeamVision {
  const vision = visionFor(world, shooter.team);
  if (vision === null) throw new Error('need team vision');
  vision.visible.delete(target.id);
  vision.detected.add(target.id);
  vision.tracks.set(target.id, {
    id: target.id,
    team: target.team,
    frame: target.frame,
    chassisClass: target.chassisClass,
    pos: { ...point },
    tick: world.tick,
    source: 'sensor',
  });
  return vision;
}

describe('sensor probe payoff', () => {
  it('reports zero, one and multiple operational hostiles inside the inclusive sweep', () => {
    const world = playerWorld('probe-contact-count');
    const team = world.playerTeam ?? 0;
    const at = { x: 400, y: 400 };
    const enemies = world.entities.filter((entity) => entity.team !== team);
    const [near, second, wreck, withdrawn] = enemies;
    if (near === undefined || second === undefined || wreck === undefined || withdrawn === undefined) {
      throw new Error('need four hostile contacts');
    }
    for (const enemy of enemies) enemy.pos = { x: 900, y: 900 };
    const friendly = world.entities.find((entity) => entity.team === team);
    if (friendly === undefined) throw new Error('need a friendly unit');
    friendly.pos = { ...at };
    wreck.destroyed = true;
    withdrawn.withdrawn = true;
    world.resources.set(team, 10_000);

    const resolve = (): number | undefined => {
      expect(callSupport(world, team, 'sensor_probe', at).ok).toBe(true);
      updateSupport(world);
      return eventsOfType(world.events, 'support_resolved').at(-1)?.contactCount;
    };

    expect(resolve()).toBe(0);
    near.pos = { x: at.x + world.rules.support.sensor_probe.radius, y: at.y };
    expect(resolve()).toBe(1);
    second.pos = { x: at.x, y: at.y + 20 };
    wreck.pos = { x: at.x + 10, y: at.y };
    withdrawn.pos = { x: at.x + 20, y: at.y };
    expect(resolve()).toBe(2);
  });

  it('lets a live sensor return guide indirect mounts but never direct fire or called shots', () => {
    const world = playerWorld('probe-indirect-order');
    const shooter = unitOf(world, 'bulwark_assault');
    const target = world.entities.find((entity) => entity.team !== shooter.team);
    if (target === undefined) throw new Error('need a hostile contact');
    shooter.pos = { x: 400, y: 400 };
    shooter.facing = 0;
    shooter.torsoOffset = 0;
    target.pos = { x: 520, y: 400 };
    sensorContact(world, shooter, target, { x: 520, y: 400 });

    expect(issueAttack(world, shooter, target.id, 'left_arm')).toBe(true);
    expect(shooter.orders.attack).toEqual({ targetId: target.id, calledShot: null });
    updatePlayerControl(world, shooter);
    updateWeapons(world, shooter);

    const fired = eventsOfType(world.events, 'weapon_fired').filter(
      (event) => event.shooterId === shooter.id,
    );
    expect(fired.length).toBeGreaterThan(0);
    expect(fired.every((event) =>
      world.catalog.weapons.get(event.weaponId)?.tags.includes('indirect_fire') === true,
    )).toBe(true);

    shooter.orders.attack = null;
    shooter.targetId = null;
    shooter.weapons = shooter.weapons.filter((mount) =>
      world.catalog.weapons.get(mount.weaponId)?.tags.includes('indirect_fire') !== true,
    );
    expect(issueAttack(world, shooter, target.id, null)).toBe(false);
  });

  it('refuses a stale last-known track after electronic detection ends', () => {
    const world = playerWorld('probe-stale-track');
    const shooter = unitOf(world, 'bulwark_assault');
    const target = world.entities.find((entity) => entity.team !== shooter.team);
    if (target === undefined) throw new Error('need a hostile contact');
    const vision = visionFor(world, shooter.team);
    if (vision === null) throw new Error('need team vision');
    vision.visible.clear();
    vision.detected.clear();
    vision.tracks.set(target.id, {
      id: target.id,
      team: target.team,
      frame: target.frame,
      chassisClass: target.chassisClass,
      pos: { x: target.pos.x, y: target.pos.y },
      tick: world.tick,
      source: 'sensor',
    });

    expect(issueAttack(world, shooter, target.id, null)).toBe(false);
  });

  it('ranges and bears against the same coarse point when hidden exact positions differ', () => {
    const outcome = (hidden: Vec2) => {
      const world = playerWorld('probe-private-geometry');
      const shooter = unitOf(world, 'bulwark_assault');
      const target = world.entities.find((entity) => entity.team !== shooter.team);
      if (target === undefined) throw new Error('need hostile contact');
      shooter.pos = { x: 360, y: 504 };
      shooter.facing = Math.PI / 2;
      shooter.torsoOffset = 0;
      target.pos = hidden;
      sensorContact(world, shooter, target, { x: 504, y: 504 });
      shooter.targetId = target.id;
      updateTorso(world, shooter);
      const torsoOffset = shooter.torsoOffset;
      shooter.facing = 0;
      shooter.torsoOffset = 0;
      updateWeapons(world, shooter);
      return {
        torsoOffset,
        fired: eventsOfType(world.events, 'weapon_fired').map(({ weaponId }) => weaponId),
        projectiles: world.projectiles.map(({ weaponId, hit, impactTick, from }) => ({
          weaponId,
          hit,
          impactTick,
          from,
        })),
      };
    };

    expect(outcome({ x: 481, y: 481 })).toEqual(outcome({ x: 527, y: 527 }));
  });

  it('preserves a current indirect target through world cleanup, then drops it on expiry', () => {
    const world = playerWorld('probe-world-target-lifecycle');
    const shooter = unitOf(world, 'bulwark_assault');
    const target = world.entities.find((entity) => entity.team !== shooter.team);
    if (target === undefined) throw new Error('need hostile contact');
    shooter.pos = { x: 360, y: 408 };
    shooter.facing = 0;
    target.pos = { x: 505, y: 408 };
    for (const entity of world.entities) {
      entity.sightRange = 0;
      entity.sensorRange = 0;
      entity.controller = 'orders';
    }
    world.reveals = [{
      team: shooter.team,
      kind: 'sensor',
      x: target.pos.x,
      y: target.pos.y,
      radius: 260,
      expiresTick: world.tick + 100,
    }];
    updateTeamVisions(world);
    expect(issueAttack(world, shooter, target.id, 'left_arm')).toBe(true);
    shooter.calledShot = 'head';
    world.events.length = 0;

    stepWorld(world, 10_000);

    expect(shooter.targetId).toBe(target.id);
    expect(shooter.calledShot).toBeNull();
    expect(eventsOfType(world.events, 'weapon_fired').some(
      (event) => event.shooterId === shooter.id,
    )).toBe(true);

    world.reveals.length = 0;
    stepWorld(world, 10_000);
    expect(shooter.targetId).toBeNull();
  });
});
