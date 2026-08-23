import { beforeEach, describe, expect, it } from 'vitest';
import { playerWorld, unitOf } from '../../tests/support';
import {
  isHoldingFire,
  issueAttack,
  issueMove,
  issueStop,
  setGroupEnabled,
  setHoldFire,
  setPosture,
  updatePlayerControl,
} from './orders';
import { distance } from './math';
import { eventsOfType } from './events';
import { updateWeapons } from './combat';
import { isVisibleTo, updateTeamVisions, updateVision, visionFor } from './sensors';
import { isOperational, type MechEntity, type World } from './types';
import { stepWorld } from './world';

let world: World;
let mech: MechEntity;

// Energy weapons resolve on the tick they fire, so only the event stream records every shot.
function shotsBy(active: World, shooterId: number): string[] {
  return eventsOfType(active.events, 'weapon_fired')
    .filter((event) => event.shooterId === shooterId)
    .map((event) => event.weaponId);
}

beforeEach(() => {
  world = playerWorld('orders');
  mech = unitOf(world, 'sentinel_brawler');
});

describe('control assignment', () => {
  it('puts the player team under order control and the rest on autopilot', () => {
    for (const entity of world.entities) {
      expect(entity.autopilot).toBe(entity.team !== 0);
    }
  });

  it('leaves every unit on autopilot when there is no player team', () => {
    const headless = playerWorld('headless', 9);
    expect(headless.entities.every((entity) => entity.autopilot)).toBe(true);
  });
});

describe('issueMove', () => {
  it('plans a path and records the order', () => {
    const ok = issueMove(world, mech, { x: 400, y: 600 }, false);
    expect(ok).toBe(true);
    expect(mech.orders.move?.to).toEqual({ x: 400, y: 600 });
    expect(mech.path.length).toBeGreaterThan(0);
    expect(mech.motion).toBe('walk');
  });

  it('marks the mech as running when ordered to run', () => {
    issueMove(world, mech, { x: 400, y: 600 }, true);
    expect(mech.motion).toBe('run');
  });

  it('retargets an order past the map edge to ground inside it', () => {
    const walled = playerWorld('walled');
    const target = unitOf(walled, 'sentinel_brawler');
    // The void beside the battlefield is clickable from any camera near the
    // border; the order means the border, not nothing.
    const ok = issueMove(walled, target, { x: 1_000_000, y: 1_000_000 }, false);
    expect(ok).toBe(true);
    const to = target.orders.move?.to;
    expect(to).toBeDefined();
    if (to !== undefined) {
      const size = walled.terrain.tileSize;
      expect(to.x).toBeLessThanOrEqual(walled.terrain.width * size);
      expect(to.y).toBeLessThanOrEqual(walled.terrain.height * size);
    }
  });

  it('clears the order once the mech arrives', () => {
    issueMove(world, mech, { x: 400, y: 600 }, false);
    mech.pos = { x: 400, y: 600 };
    updatePlayerControl(world, mech);
    expect(mech.orders.move).toBeNull();
    expect(mech.motion).toBe('stationary');
  });

  it('is cancelled by a stop order', () => {
    issueMove(world, mech, { x: 400, y: 600 }, false);
    issueStop(mech);
    expect(mech.orders.move).toBeNull();
    expect(mech.path).toHaveLength(0);
    expect(mech.motion).toBe('stationary');
  });

  it('cancels an active and queued route when both legs are lost', () => {
    expect(issueMove(world, mech, { x: 400, y: 600 }, false)).toBe(true);
    expect(issueMove(world, mech, { x: 500, y: 600 }, true, { queued: true })).toBe(true);
    mech.locations.left_leg.destroyed = true;
    mech.locations.right_leg.destroyed = true;

    updatePlayerControl(world, mech);

    expect(mech.orders.move).toBeNull();
    expect(mech.orders.queue).toEqual([]);
    expect(mech.path).toEqual([]);
    expect(mech.motion).toBe('stationary');
    expect(mech.intendedMotion).toBe('stationary');
  });

  it('cancels a route when the second leg is lost during shutdown', () => {
    const enemy = world.entities.find((entity) => entity.team !== mech.team);
    if (enemy === undefined) throw new Error('need an enemy');
    expect(issueMove(world, mech, { x: 400, y: 600 }, false)).toBe(true);
    expect(issueMove(world, mech, { x: 500, y: 600 }, true, { queued: true })).toBe(true);
    issueAttack(mech, enemy.id, 'left_arm');
    const groupIntent = [...mech.groupIntent];
    const groupEnabled = [...mech.groupEnabled];
    mech.shutdownRemaining = 4;
    mech.locations.left_leg.destroyed = true;
    mech.locations.right_leg.destroyed = true;

    updatePlayerControl(world, mech);

    expect(mech.orders.move).toBeNull();
    expect(mech.orders.queue).toEqual([]);
    expect(mech.path).toEqual([]);
    expect(mech.orders.attack).toEqual({ targetId: enemy.id, calledShot: 'left_arm' });
    expect(mech.groupIntent).toEqual(groupIntent);
    expect(mech.groupEnabled).toEqual(groupEnabled);
    expect(mech.motion).toBe('stationary');
    expect(mech.intendedMotion).toBe('stationary');
  });
});

describe('targeting', () => {
  it('holds an ordered target even when a closer enemy exists', () => {
    const enemies = world.entities.filter((entity) => entity.team === 1);
    const far = enemies[enemies.length - 1];
    const near = enemies[0];
    expect(far).toBeDefined();
    expect(near).toBeDefined();

    mech.pos = { x: 500, y: 12 };
    near!.pos = { x: 530, y: 12 };
    far!.pos = { x: 620, y: 12 };
    mech.sensorRange = 1_000;
    far!.signature = 1;
    updateTeamVisions(world);
    issueAttack(mech, far!.id, null);
    updatePlayerControl(world, mech);

    expect(mech.targetId).toBe(far!.id);
  });

  it('drops the order and reacquires when the ordered target dies', () => {
    const enemy = world.entities.find((entity) => entity.team === 1);
    expect(enemy).toBeDefined();

    issueAttack(mech, enemy!.id, null);
    enemy!.destroyed = true;
    updatePlayerControl(world, mech);

    expect(mech.orders.attack).toBeNull();
    expect(mech.targetId).not.toBe(enemy!.id);
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
    mech.sensorRange = 1_000;
    enemy.signature = 1;
    updateTeamVisions(world);
    issueAttack(mech, enemy.id, 'left_leg');
    updatePlayerControl(world, mech);
    expect(mech.calledShot).toBe('left_leg');
  });

  it('pursues a frozen sensor ghost without tracking or firing at the hidden target', () => {
    const enemy = world.entities.find((entity) => entity.team !== mech.team);
    if (enemy === undefined) throw new Error('need an enemy');
    mech.pos = { x: 500, y: 12 };
    mech.sensorRange = 1_000;
    enemy.pos = { x: 620, y: 12 };
    enemy.signature = 1;
    updateTeamVisions(world);
    const vision = visionFor(world, mech.team);
    expect(isVisibleTo(vision, enemy)).toBe(true);
    const lastKnown = vision?.ghosts.get(enemy.id)?.pos;
    if (lastKnown === undefined) throw new Error('need a sensor ghost');

    issueAttack(mech, enemy.id, 'left_arm');
    enemy.pos = { x: 900, y: 500 };
    for (const ally of world.entities) {
      if (ally.team === mech.team) ally.sensorRange = 0;
    }
    updateTeamVisions(world);
    expect(isVisibleTo(vision, enemy)).toBe(false);

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

    mech.sensorRange = 1_000;
    enemy.pos = { ...lastKnown };
    updateTeamVisions(world);
    updatePlayerControl(world, mech);
    expect(mech.targetId).toBe(enemy.id);
    expect(mech.calledShot).toBe('left_arm');
  });

  it('keeps hidden attack intent but plots no approach after both legs are lost', () => {
    const enemy = world.entities.find((entity) => entity.team !== mech.team);
    if (enemy === undefined) throw new Error('need an enemy');
    for (const ally of world.entities) {
      if (ally.team === mech.team) ally.sensorRange = 0;
    }
    updateTeamVisions(world);
    issueAttack(mech, enemy.id, 'left_arm');
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

describe('weapon groups', () => {
  it('starts with every group live', () => {
    expect(mech.groupEnabled.every((enabled) => enabled)).toBe(true);
    expect(isHoldingFire(mech)).toBe(false);
  });

  it('toggles a single group', () => {
    setGroupEnabled(mech, 2, false);
    expect(mech.groupEnabled[1]).toBe(false);
    expect(isHoldingFire(mech)).toBe(false);
  });

  it('ignores a group index outside 1-4', () => {
    setGroupEnabled(mech, 9, false);
    expect(mech.groupEnabled).toHaveLength(4);
    expect(mech.groupEnabled.every((enabled) => enabled)).toBe(true);
  });

  it('holds fire by disabling every group, and clears the target', () => {
    setHoldFire(mech, true);
    expect(isHoldingFire(mech)).toBe(true);

    updatePlayerControl(world, mech);
    expect(mech.targetId).toBeNull();

    setHoldFire(mech, false);
    expect(isHoldingFire(mech)).toBe(false);
  });

  it('stops a held group from firing', () => {
    const enemy = world.entities.find((entity) => entity.team === 1);
    expect(enemy).toBeDefined();

    mech.pos = { x: 500, y: 500 };
    enemy!.pos = { x: 560, y: 500 };
    mech.facing = 0;
    mech.targetId = enemy!.id;
    setHoldFire(mech, true);

    stepWorld(world, 100);
    expect(shotsBy(world, mech.id)).toHaveLength(0);
  });

  it('lets a live group fire while a held group stays silent', () => {
    const enemy = world.entities.find((entity) => entity.team === 1);
    expect(enemy).toBeDefined();

    mech.pos = { x: 500, y: 500 };
    enemy!.pos = { x: 560, y: 500 };
    mech.facing = 0;
    mech.targetId = enemy!.id;

    setGroupEnabled(mech, 2, false);
    setGroupEnabled(mech, 3, false);
    stepWorld(world, 100);

    const fired = shotsBy(world, mech.id);
    expect(fired.length).toBeGreaterThan(0);
    for (const weaponId of fired) {
      expect(world.catalog.weapons.get(weaponId)?.type).toBe('energy');
    }
  });
});

describe('player units under stepWorld', () => {
  it('are not steered by the placeholder AI', () => {
    issueMove(world, mech, { x: mech.pos.x + 200, y: mech.pos.y - 200 }, false);
    const destination = { ...mech.orders.move!.to };

    for (let tick = 0; tick < 40; tick += 1) stepWorld(world, 6000);

    expect(mech.orders.move?.to).toEqual(destination);
    expect(isOperational(mech)).toBe(true);
  });
});

describe('short move orders', () => {
  it('walks the last few metres to a point inside the mech\'s own tile', () => {
    const world = playerWorld('short-move');
    const mech = unitOf(world, 'sentinel_brawler');
    mech.controller = 'orders';
    mech.autopilot = false;

    // A tile is four times the arrival radius across, so a destination can sit
    // well outside "arrived" while still being in the tile the mech stands on.
    const size = world.terrain.tileSize;
    const goal = { x: mech.pos.x + size * 0.45, y: mech.pos.y };
    expect(distance(mech.pos, goal)).toBeGreaterThan(world.rules.movement.arrivalRadius);
    expect(world.terrain.toTile(goal)).toEqual(world.terrain.toTile(mech.pos));

    expect(issueMove(world, mech, goal, false)).toBe(true);
    for (let tick = 0; tick < 200 && mech.orders.move !== null; tick += 1) {
      stepWorld(world, 100_000);
    }

    expect(
      distance(mech.pos, goal),
      'the order was cancelled instead of walked',
    ).toBeLessThanOrEqual(world.rules.movement.arrivalRadius);
  });

  it('walks an order aimed off the map to the near border and completes', () => {
    const world = playerWorld('unreachable');
    const mech = unitOf(world, 'sentinel_brawler');
    mech.controller = 'orders';
    mech.autopilot = false;
    for (const entity of world.entities) {
      setHoldFire(entity, true);
      if (entity.team !== mech.team) {
        entity.controller = 'orders';
        setPosture(entity, 'hold_position');
      }
    }
    for (const state of Object.values(mech.locations)) {
      state.armour = 1e9;
      state.internal = 1e9;
    }

    // Off the map entirely: the order retargets to the border and finishes
    // there — an order that silently does nothing reads as a broken control.
    const goal = { x: -500, y: -500 };
    issueMove(world, mech, goal, false);
    const anchored = mech.orders.move?.to;
    expect(anchored).toBeDefined();
    if (anchored !== undefined) {
      expect(anchored.x).toBeGreaterThanOrEqual(0);
      expect(anchored.y).toBeGreaterThanOrEqual(0);
    }
    for (let tick = 0; tick < 2_000 && mech.orders.move !== null; tick += 1) {
      stepWorld(world, 100_000);
    }
    expect(mech.orders.move).toBeNull();
  });
});
