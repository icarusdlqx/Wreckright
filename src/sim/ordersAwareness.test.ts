import { beforeEach, describe, expect, it } from 'vitest';
import { playerWorld, unitOf } from '../../tests/support';
import { updateWeapons } from './combat';
import { eventsOfType } from './events';
import { distance } from './math';
import { issueAttack, updatePlayerControl } from './orders';
import { isSightedBy, trackFor, updateTeamVisions, updateVision, visionFor } from './sensors';
import type { MechEntity, World } from './types';

let world: World;
let mech: MechEntity;

function shotsBy(active: World, shooterId: number): string[] {
  return eventsOfType(active.events, 'weapon_fired')
    .filter((event) => event.shooterId === shooterId)
    .map((event) => event.weaponId);
}

beforeEach(() => {
  world = playerWorld('orders-awareness');
  mech = unitOf(world, 'sentinel_brawler');
});

describe('order targeting awareness', () => {
  it('holds an ordered target even when a closer enemy exists', () => {
    const enemies = world.entities.filter((entity) => entity.team === 1);
    const far = enemies[enemies.length - 1];
    const near = enemies[0];
    expect(far).toBeDefined();
    expect(near).toBeDefined();

    mech.pos = { x: 500, y: 12 };
    near!.pos = { x: 530, y: 12 };
    far!.pos = { x: 620, y: 12 };
    mech.sightRange = 1_000;
    far!.signature = 1;
    updateTeamVisions(world);
    issueAttack(world, mech, far!.id, null);
    updatePlayerControl(world, mech);

    expect(mech.targetId).toBe(far!.id);
  });

  it('does not learn that an ordered target died after optical contact is lost', () => {
    const enemy = world.entities.find((entity) => entity.team === 1);
    expect(enemy).toBeDefined();

    enemy!.pos = { x: mech.pos.x + 60, y: mech.pos.y };
    mech.sightRange = 1_000;
    updateTeamVisions(world);
    issueAttack(world, mech, enemy!.id, null);
    enemy!.pos = { x: 900, y: 500 };
    for (const ally of world.entities) {
      if (ally.team === mech.team) {
        ally.sensorRange = 0;
        ally.sightRange = 0;
      }
    }
    updateTeamVisions(world);
    enemy!.destroyed = true;
    updateTeamVisions(world);
    updatePlayerControl(world, mech);

    expect(mech.orders.attack?.targetId).toBe(enemy!.id);
    expect(mech.targetId).toBeNull();
    expect(mech.calledShot).toBeNull();
  });

  it('clears an attack order after the team observes the target as a hulk', () => {
    const enemy = world.entities.find((entity) => entity.team === 1);
    if (enemy === undefined) throw new Error('need an enemy');
    enemy.pos = { x: mech.pos.x + 60, y: mech.pos.y };
    mech.sightRange = 1_000;
    updateTeamVisions(world);
    expect(issueAttack(world, mech, enemy.id, null)).toBe(true);

    enemy.destroyed = true;
    updateTeamVisions(world);
    updatePlayerControl(world, mech);

    expect(visionFor(world, mech.team)?.observedHulks.has(enemy.id)).toBe(true);
    expect(mech.orders.attack).toBeNull();
    expect(mech.targetId).not.toBe(enemy.id);
  });

  it('auto-acquires the nearest visible enemy', () => {
    const enemy = world.entities.find((entity) => entity.team === 1);
    expect(enemy).toBeDefined();
    enemy!.pos = { x: mech.pos.x + 60, y: mech.pos.y };
    if (world.vision !== null) updateVision(world, world.vision);

    updatePlayerControl(world, mech);
    expect(mech.targetId).toBe(enemy!.id);
  });

  it('does not auto-acquire an enemy hidden by fog', () => {
    updatePlayerControl(world, mech);
    const visible = world.vision?.visible.size ?? 0;
    if (visible === 0) expect(mech.targetId).toBeNull();
    else expect(world.vision?.visible.has(mech.targetId ?? -1)).toBe(true);
  });

  it('carries a called shot through to the entity', () => {
    const enemy = world.entities.find((entity) => entity.team === 1);
    if (enemy === undefined) throw new Error('need an enemy');
    mech.pos = { x: 500, y: 12 };
    enemy.pos = { x: 560, y: 12 };
    mech.sightRange = 1_000;
    enemy.signature = 1;
    updateTeamVisions(world);
    issueAttack(world, mech, enemy.id, 'left_leg');
    updatePlayerControl(world, mech);
    expect(mech.calledShot).toBe('left_leg');
  });

  it('pursues a frozen coarse track without tracking or firing at the hidden target', () => {
    const enemy = world.entities.find((entity) => entity.team !== mech.team);
    if (enemy === undefined) throw new Error('need an enemy');
    mech.pos = { x: 500, y: 12 };
    mech.sensorRange = 1_000;
    mech.sightRange = 1_000;
    enemy.pos = { x: 620, y: 12 };
    enemy.signature = 1;
    updateTeamVisions(world);
    const vision = visionFor(world, mech.team);
    expect(isSightedBy(vision, enemy)).toBe(true);
    const lastKnown = trackFor(vision, enemy.id)?.pos;
    if (lastKnown === undefined) throw new Error('need a contact track');

    issueAttack(world, mech, enemy.id, 'left_arm');
    enemy.pos = { x: 900, y: 500 };
    for (const ally of world.entities) {
      if (ally.team === mech.team) {
        ally.sensorRange = 0;
        ally.sightRange = 0;
      }
    }
    updateTeamVisions(world);
    expect(isSightedBy(vision, enemy)).toBe(false);

    updatePlayerControl(world, mech);
    updateWeapons(world, mech);

    expect(mech.orders.attack?.targetId).toBe(enemy.id);
    expect(mech.targetId).toBeNull();
    expect(mech.calledShot).toBeNull();
    expect(mech.path.length).toBeGreaterThan(0);
    const pathEnd = mech.path.at(-1);
    expect(pathEnd).toBeDefined();
    if (pathEnd !== undefined) {
      expect(distance(pathEnd, lastKnown)).toBeLessThan(distance(pathEnd, enemy.pos));
    }
    expect(shotsBy(world, mech.id)).toEqual([]);

    mech.sightRange = 1_000;
    enemy.pos = { ...lastKnown };
    updateTeamVisions(world);
    updatePlayerControl(world, mech);
    expect(mech.targetId).toBe(enemy.id);
    expect(mech.calledShot).toBe('left_arm');
  });

  it('keeps hidden attack intent but plots no approach after both legs are lost', () => {
    const enemy = world.entities.find((entity) => entity.team !== mech.team);
    if (enemy === undefined) throw new Error('need an enemy');
    enemy.pos = { x: mech.pos.x + 60, y: mech.pos.y };
    mech.sightRange = 1_000;
    updateTeamVisions(world);
    issueAttack(world, mech, enemy.id, 'left_arm');
    for (const ally of world.entities) {
      if (ally.team === mech.team) {
        ally.sensorRange = 0;
        ally.sightRange = 0;
      }
    }
    enemy.pos = { x: 900, y: 500 };
    updateTeamVisions(world);
    mech.locations.left_leg.destroyed = true;
    mech.locations.right_leg.destroyed = true;

    updatePlayerControl(world, mech);

    expect(mech.orders.attack?.targetId).toBe(enemy.id);
    expect(mech.targetId).toBeNull();
    expect(mech.calledShot).toBeNull();
    expect(mech.path).toEqual([]);
    expect(mech.motion).toBe('stationary');
  });
});
