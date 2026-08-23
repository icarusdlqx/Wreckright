import { describe, expect, it } from 'vitest';
import { makeGrid, OPEN_LEGEND, playerWorld, unitOf } from '../../tests/support';
import { updateWeapons } from './combat';
import { eventsOfType } from './events';
import { issueAttack, issueMove, updatePlayerControl } from './orders';
import { approachToEngage, approachToLastKnown, engageWorthTarget } from './orderTargeting';
import { visionFor } from './sensors';
import { isOperational, type MechEntity, type World } from './types';

function shortGunFixture(seed: string, lrmRounds: number): {
  world: World;
  mech: MechEntity;
  quarry: MechEntity;
} {
  const world = playerWorld(seed);
  const mech = unitOf(world, 'sentinel_brawler');
  const quarry = world.entities.find((entity) => entity.team !== mech.team);
  if (quarry === undefined) throw new Error('need an enemy');
  world.terrain = makeGrid({ legend: OPEN_LEGEND, tiles: ['.'.repeat(40)] });
  mech.pos = { x: 15, y: 5 };
  quarry.pos = { x: 315, y: 5 };
  mech.weapons = [
    {
      index: 0,
      weaponId: 'lrm10',
      location: 'left_torso',
      group: 1,
      cooldown: 0,
      destroyed: false,
    },
    {
      index: 1,
      weaponId: 'small_laser',
      location: 'centre_torso',
      group: 2,
      cooldown: 0,
      destroyed: false,
    },
  ];
  mech.ammoBins = [
    {
      index: 0,
      weaponId: 'lrm10',
      location: 'left_torso',
      rounds: lrmRounds,
      roundsMax: 12,
      protectedByCase: false,
      destroyed: false,
    },
  ];
  mech.groupIntent = [true, true, true, true];
  mech.groupEnabled = [true, true, true, true];
  return { world, mech, quarry };
}

describe('order targeting awareness', () => {
  it('pursues only passable ground inside the authored coarse-track uncertainty', () => {
    const world = playerWorld('bounded-ordered-track');
    const mech = unitOf(world, 'sentinel_brawler');
    const tileSize = 10;
    const width = 25;
    const height = 15;
    const reported = { x: 125, y: 75 };
    const trackColumn = Math.floor(reported.x / tileSize);
    const trackRow = Math.floor(reported.y / tileSize);
    const searchRadius = Math.ceil(
      Math.max(
        world.rules.sensors.trackGridMetres,
        world.rules.movement.arrivalRadius,
      ) / tileSize,
    );
    const grid = (blockedThrough: number) => makeGrid({
      legend: OPEN_LEGEND,
      tileSize,
      tiles: Array.from({ length: height }, (_, row) =>
        Array.from({ length: width }, (_, column) =>
          Math.max(Math.abs(column - trackColumn), Math.abs(row - trackRow)) <= blockedThrough
            ? '#'
            : '.',
        ).join(''),
      ),
    });

    world.terrain = grid(searchRadius - 1);
    mech.pos = world.terrain.tileCentre(1, trackRow);
    expect(approachToLastKnown(world, mech, reported)).toBe(true);
    const destination = mech.path.at(-1);
    expect(destination).toBeDefined();
    if (destination === undefined) return;
    const destinationTile = world.terrain.toTile(destination);
    expect(world.terrain.passable(destinationTile.column, destinationTile.row)).toBe(true);
    expect(
      Math.max(
        Math.abs(destinationTile.column - trackColumn),
        Math.abs(destinationTile.row - trackRow),
      ),
    ).toBeLessThanOrEqual(searchRadius);

    world.terrain = grid(searchRadius);
    mech.path.length = 0;
    expect(approachToLastKnown(world, mech, reported)).toBe(false);
    expect(mech.path).toEqual([]);
  });

  it('retires an expired ordered contact and acquires another sighted enemy', () => {
    const world = playerWorld('expired-ordered-contact');
    const mech = unitOf(world, 'sentinel_brawler');
    const [expired, available] = world.entities.filter((entity) => entity.team !== mech.team);
    if (expired === undefined || available === undefined) throw new Error('need two enemies');
    const vision = visionFor(world, mech.team);
    if (vision === null) throw new Error('need a team vision');

    world.terrain = makeGrid({
      legend: OPEN_LEGEND,
      tiles: ['.........', '.........', '.........', '.........', '.........'],
    });
    mech.pos = { x: 15, y: 25 };
    expired.pos = { x: 35, y: 25 };
    available.pos = { x: 55, y: 25 };
    vision.visible.clear();
    vision.visible.add(expired.id);
    vision.tracks.set(expired.id, {
      id: expired.id,
      team: expired.team,
      frame: expired.frame,
      chassisClass: expired.chassisClass,
      pos: { x: expired.pos.x, y: expired.pos.y },
      tick: world.tick,
      source: 'optical',
    });
    expect(issueAttack(world, mech, expired.id, null)).toBe(true);

    // The report ages out while the machine remains operational somewhere the
    // player cannot see. A different optical contact is still actionable.
    vision.visible.clear();
    vision.visible.add(available.id);
    vision.detected.delete(expired.id);
    vision.tracks.delete(expired.id);
    vision.ghosts.delete(expired.id);

    updatePlayerControl(world, mech);

    expect(isOperational(expired)).toBe(true);
    expect(vision.observedHulks.has(expired.id)).toBe(false);
    expect(mech.orders.attack).toBeNull();
    expect(mech.targetId).toBe(available.id);
  });

  it('ordinary acquisition skips a nearer team-sighted target behind a ridge', () => {
    const world = playerWorld('idle-own-sight');
    const mech = unitOf(world, 'sentinel_brawler');
    const [blocked, clear] = world.entities.filter((entity) => entity.team !== mech.team);
    if (blocked === undefined || clear === undefined) throw new Error('need two enemies');
    const vision = visionFor(world, mech.team);
    if (vision === null) throw new Error('need a team vision');

    world.terrain = makeGrid({
      legend: OPEN_LEGEND,
      tiles: ['.........', '.........', '..b......', '.........', '.........'],
    });
    mech.pos = { x: 35, y: 25 };
    blocked.pos = { x: 5, y: 25 };
    clear.pos = { x: 75, y: 25 };
    vision.visible.clear();
    vision.visible.add(blocked.id);
    vision.visible.add(clear.id);

    updatePlayerControl(world, mech);

    expect(mech.targetId).toBe(clear.id);
    mech.facing = 0;
    mech.torsoOffset = 0;
    updateWeapons(world, mech);
    expect(
      eventsOfType(world.events, 'weapon_fired').some(
        (event) => event.shooterId === mech.id && event.targetId === clear.id,
      ),
    ).toBe(true);
  });

  it('closes past a dry LRM envelope for its live short laser', () => {
    const { world, mech, quarry } = shortGunFixture('dry-long-gun', 0);
    // A heat governor may shed a live gun for this tick; intent still defines
    // where the pilot wants to fight once the reactor catches up.
    mech.groupEnabled[1] = false;

    expect(approachToEngage(world, mech, quarry)).toBe(true);
    expect(mech.path.length).toBeGreaterThan(0);
  });

  it('keeps closing when the player disabled the long-range weapon group', () => {
    const { world, mech, quarry } = shortGunFixture('held-long-gun', 12);
    mech.groupIntent[0] = false;
    mech.groupEnabled[0] = true;

    expect(approachToEngage(world, mech, quarry)).toBe(true);
    expect(mech.path.length).toBeGreaterThan(0);
  });

  it('halts attack-move inside the authored beyond-long firing band', () => {
    const { world, mech, quarry } = shortGunFixture('beyond-long-engage', 12);
    world.terrain = makeGrid({ legend: OPEN_LEGEND, tiles: ['.'.repeat(100)] });
    const lrm = world.catalog.weapons.get('lrm10');
    if (lrm === undefined) throw new Error('need an LRM');
    const range = lrm.range.long * (1 + world.rules.combat.maxRangeMultiplier) / 2;
    quarry.pos = { x: mech.pos.x + range, y: mech.pos.y };
    mech.groupIntent[1] = false;
    const vision = visionFor(world, mech.team);
    if (vision === null) throw new Error('need a team vision');
    vision.visible.clear();
    vision.visible.add(quarry.id);

    expect(range).toBeGreaterThan(lrm.range.long);
    expect(engageWorthTarget(world, mech)?.id).toBe(quarry.id);
    mech.targetId = quarry.id;
    mech.facing = 0;
    mech.torsoOffset = 0;
    updateWeapons(world, mech);
    expect(
      eventsOfType(world.events, 'weapon_fired').some(
        (event) => event.shooterId === mech.id && event.weaponId === 'lrm10',
      ),
    ).toBe(true);
  });

  it('halts attack-move only for a target this mech can see past the ridge', () => {
    const world = playerWorld('attack-move-own-sight');
    const mech = unitOf(world, 'sentinel_brawler');
    const [blocked, clear] = world.entities.filter((entity) => entity.team !== mech.team);
    if (blocked === undefined || clear === undefined) throw new Error('need two enemies');
    const vision = visionFor(world, mech.team);
    if (vision === null) throw new Error('need a team vision');

    world.terrain = makeGrid({
      legend: OPEN_LEGEND,
      tiles: ['.........', '.........', '..b......', '.........', '.........'],
    });
    mech.pos = { x: 35, y: 25 };
    blocked.pos = { x: 5, y: 25 };
    clear.pos = { x: 75, y: 25 };
    vision.visible.clear();
    vision.visible.add(blocked.id);

    expect(engageWorthTarget(world, mech)).toBeNull();
    expect(issueMove(world, mech, { x: 85, y: 45 }, false, { engage: true })).toBe(true);
    updatePlayerControl(world, mech);
    expect(mech.motion).toBe('walk');

    vision.visible.add(clear.id);
    expect(engageWorthTarget(world, mech)?.id).toBe(clear.id);
    updatePlayerControl(world, mech);
    expect(mech.motion).toBe('stationary');
    expect(mech.targetId).toBe(clear.id);
    mech.facing = 0;
    mech.torsoOffset = 0;
    updateWeapons(world, mech);
    expect(
      eventsOfType(world.events, 'weapon_fired').some(
        (event) => event.shooterId === mech.id && event.targetId === clear.id,
      ),
    ).toBe(true);
  });

  it('fires at an attack-move contact while preserving its hidden ordered quarry', () => {
    const world = playerWorld('attack-move-passing-contact');
    const mech = unitOf(world, 'sentinel_brawler');
    const [quarry, passing] = world.entities.filter((entity) => entity.team !== mech.team);
    if (quarry === undefined || passing === undefined) throw new Error('need two enemies');
    const vision = visionFor(world, mech.team);
    if (vision === null) throw new Error('need a team vision');

    world.terrain = makeGrid({
      legend: OPEN_LEGEND,
      tiles: ['.........', '.........', '.........', '.........', '.........'],
    });
    mech.pos = { x: 15, y: 25 };
    quarry.pos = { x: 45, y: 25 };
    passing.pos = { x: 55, y: 25 };
    vision.visible.clear();
    vision.visible.add(quarry.id);
    vision.tracks.set(quarry.id, {
      id: quarry.id,
      team: quarry.team,
      frame: quarry.frame,
      chassisClass: quarry.chassisClass,
      pos: { x: quarry.pos.x, y: quarry.pos.y },
      tick: world.tick,
      source: 'optical',
    });

    expect(issueMove(world, mech, { x: 85, y: 45 }, false, { engage: true })).toBe(true);
    expect(issueAttack(world, mech, quarry.id, 'left_arm')).toBe(true);

    vision.visible.clear();
    vision.visible.add(passing.id);
    updatePlayerControl(world, mech);

    expect(mech.motion).toBe('stationary');
    expect(mech.targetId).toBe(passing.id);
    expect(mech.calledShot).toBeNull();
    expect(mech.orders.attack).toEqual({ targetId: quarry.id, calledShot: 'left_arm' });
    mech.facing = 0;
    mech.torsoOffset = 0;
    updateWeapons(world, mech);
    expect(
      eventsOfType(world.events, 'weapon_fired').some(
        (event) => event.shooterId === mech.id && event.targetId === passing.id,
      ),
    ).toBe(true);

    vision.visible.clear();
    updatePlayerControl(world, mech);
    expect(mech.motion).toBe('walk');
    expect(mech.targetId).toBeNull();
    expect(mech.orders.attack?.targetId).toBe(quarry.id);

    vision.visible.add(quarry.id);
    updatePlayerControl(world, mech);
    expect(mech.motion).toBe('stationary');
    expect(mech.targetId).toBe(quarry.id);
    expect(mech.calledShot).toBe('left_arm');
  });

  it('fires at a clear passing contact while its visible quarry is ridge-blocked', () => {
    const world = playerWorld('attack-move-occluded-quarry');
    const mech = unitOf(world, 'sentinel_brawler');
    const [quarry, passing] = world.entities.filter((entity) => entity.team !== mech.team);
    if (quarry === undefined || passing === undefined) throw new Error('need two enemies');
    const vision = visionFor(world, mech.team);
    if (vision === null) throw new Error('need a team vision');

    world.terrain = makeGrid({
      legend: OPEN_LEGEND,
      tiles: ['.........', '.........', '..b......', '.........', '.........'],
    });
    mech.pos = { x: 35, y: 25 };
    quarry.pos = { x: 5, y: 25 };
    passing.pos = { x: 75, y: 25 };
    vision.visible.clear();
    vision.visible.add(quarry.id);
    vision.visible.add(passing.id);

    expect(issueMove(world, mech, { x: 85, y: 45 }, false, { engage: true })).toBe(true);
    expect(issueAttack(world, mech, quarry.id, 'left_arm')).toBe(true);
    updatePlayerControl(world, mech);

    expect(mech.motion).toBe('stationary');
    expect(mech.targetId).toBe(passing.id);
    expect(mech.calledShot).toBeNull();
    expect(mech.orders.attack).toEqual({ targetId: quarry.id, calledShot: 'left_arm' });
    mech.facing = 0;
    mech.torsoOffset = 0;
    updateWeapons(world, mech);
    expect(
      eventsOfType(world.events, 'weapon_fired').some(
        (event) => event.shooterId === mech.id && event.targetId === passing.id,
      ),
    ).toBe(true);
  });
});
