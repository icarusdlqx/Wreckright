import { describe, expect, it } from 'vitest';
import { catalog, makeGrid, OPEN_LEGEND, testWorld, unitOf } from '../../../tests/support';
import { updateWeapons } from '../combat';
import { eventsOfType } from '../events';
import { lineOfSight } from '../los';
import { engagementRange, healthFraction, scoreTargets } from './utility';
import { updateTeamVisions, visionFor } from '../sensors';
import type { MechEntity, Vec2, World } from '../types';
import { stanceFor } from './positioning';
import { decideTactical, difficultyTier, lanceFocus } from './tactical';
import { createWorld, stepWorld } from '../world';

function clearLine(world: World, count: number): Vec2[] {
  for (let row = 1; row < world.terrain.height - 1; row += 1) {
    for (let column = 1; column < world.terrain.width - count - 1; column += 1) {
      const points = Array.from({ length: count }, (_, index) =>
        world.terrain.tileCentre(column + index * 2, row),
      );
      if (points.some((point) => {
        const tile = world.terrain.toTile(point);
        return !world.terrain.passable(tile.column, tile.row);
      })) continue;
      const first = points[0];
      const last = points.at(-1);
      if (first !== undefined && last !== undefined && lineOfSight(world.terrain, first, last).clear) {
        return points;
      }
    }
  }
  throw new Error('need a clear combat line');
}

function isolate(world: World, kept: readonly MechEntity[]): void {
  for (const entity of world.entities) entity.destroyed = !kept.includes(entity);
  for (const entity of kept) {
    entity.sensorRange = 2_000;
    entity.sightRange = 2_000;
    entity.signature = 1;
  }
}

describe('tactical controller correctness', () => {
  it('holds and shoots after both legs are gone instead of plotting another route', () => {
    const world = testWorld('legged-hold');
    const mech = world.entities.find((entity) => entity.team === 0);
    const target = world.entities.find((entity) => entity.team === 1);
    if (mech === undefined || target === undefined) throw new Error('need opposing mechs');
    isolate(world, [mech, target]);
    const [from, to] = clearLine(world, 2);
    if (from === undefined || to === undefined) throw new Error('need two positions');
    mech.pos = from;
    target.pos = to;
    mech.locations.left_leg.destroyed = true;
    mech.locations.right_leg.destroyed = true;
    mech.path = [{ x: to.x, y: to.y }];
    updateTeamVisions(world);

    decideTactical(world, mech, null, difficultyTier(world, 'regular'));

    expect(mech.path).toEqual([]);
    expect(mech.motion).toBe('stationary');
    expect(mech.targetId).toBe(target.id);
  });

  it('aims an immobile mech at the first ranked target it can personally see', () => {
    const world = testWorld('legged-clear-ranked-target');
    const mech = world.entities.find((entity) => entity.team === 0);
    const [occluded, clear] = world.entities.filter((entity) => entity.team === 1);
    if (mech === undefined || occluded === undefined || clear === undefined) {
      throw new Error('need one shooter and two targets');
    }
    isolate(world, [mech, occluded, clear]);
    world.terrain = makeGrid({
      legend: OPEN_LEGEND,
      tiles: ['.........', '.........', '..b......', '.........', '.........'],
    });
    mech.pos = { x: 35, y: 25 };
    occluded.pos = { x: 5, y: 25 };
    clear.pos = { x: 75, y: 25 };
    mech.facing = 0;
    mech.torsoOffset = 0;
    mech.locations.left_leg.destroyed = true;
    mech.locations.right_leg.destroyed = true;
    mech.targetId = occluded.id;
    for (const state of Object.values(occluded.locations)) {
      state.armour = 0;
      state.rearArmour = 0;
      state.internal = Math.max(0.1, state.internalMax * 0.02);
    }
    const vision = visionFor(world, mech.team);
    if (vision === null) throw new Error('need a team vision');
    vision.visible.clear();
    vision.visible.add(occluded.id);
    vision.visible.add(clear.id);

    expect(lineOfSight(world.terrain, mech.pos, occluded.pos).clear).toBe(false);
    expect(lineOfSight(world.terrain, mech.pos, clear.pos).clear).toBe(true);
    expect(
      scoreTargets(world, mech, {
        focusTargetId: occluded.id,
        currentTargetId: occluded.id,
      })[0]?.target.id,
    ).toBe(occluded.id);

    decideTactical(world, mech, occluded.id, difficultyTier(world, 'regular'));

    expect(mech.targetId).toBe(clear.id);
    updateWeapons(world, mech);
    expect(
      eventsOfType(world.events, 'weapon_fired').some(
        (event) => event.shooterId === mech.id && event.targetId === clear.id,
      ),
    ).toBe(true);
  });

  it('lets an immobile indirect battery hold behind cover on a scout optical solution', () => {
    const world = testWorld('indirect-team-optical');
    const battery = unitOf(world, 'cairn_battery');
    const scout = unitOf(world, 'hornet_spotter');
    const target = unitOf(world, 'wisp_scout');
    isolate(world, [battery, scout, target]);
    world.terrain = makeGrid({
      legend: OPEN_LEGEND,
      tiles: Array.from({ length: 70 }, (_, row) => {
        const cells = '.'.repeat(70).split('');
        if (row >= 20 && row <= 50) cells[30] = 'b';
        return cells.join('');
      }),
    });
    battery.pos = { x: 105, y: 405 };
    target.pos = { x: 505, y: 405 };
    scout.pos = { x: 405, y: 105 };
    battery.locations.left_leg.destroyed = true;
    battery.locations.right_leg.destroyed = true;
    updateTeamVisions(world);

    const vision = visionFor(world, battery.team);
    if (vision === null) throw new Error('need a team vision');
    expect(lineOfSight(world.terrain, battery.pos, target.pos).clear).toBe(false);
    expect(vision.visible.has(target.id)).toBe(true);

    vision.visible.delete(target.id);
    vision.identified.delete(target.id);
    vision.detected.add(target.id);
    expect(scoreTargets(world, battery, { focusTargetId: target.id, currentTargetId: null }))
      .toEqual([]);

    vision.visible.add(target.id);
    vision.identified.add(target.id);
    const scored = scoreTargets(world, battery, {
      focusTargetId: target.id,
      currentTargetId: null,
    });
    expect(scored[0]?.target.id).toBe(target.id);
    expect(scored[0]?.expectedDps).toBeGreaterThan(0);

    decideTactical(world, battery, target.id, difficultyTier(world, 'regular'));
    expect(battery.targetId).toBe(target.id);
    expect(battery.path).toEqual([]);
    expect(battery.motion).toBe('stationary');
  });

  it('sweeps inward when unseen opposition still contests its assigned zone', () => {
    const world = createWorld(catalog, {
      seed: 'contested-zone-sweep',
      missionId: 'base_capture_ridge',
      playerTeam: 0,
      playerController: 'tactical',
    });
    const scout = world.entities.find((entity) => entity.team === 0);
    const redoubt = unitOf(world, 'redoubt_emplacement');
    const zone = world.zones.find((candidate) => candidate.id === 'north_post');
    if (scout === undefined || zone === undefined) throw new Error('need the north-post fight');
    isolate(world, [scout, redoubt]);
    scout.pos = { x: 659, y: 320.8 };
    redoubt.pos = { x: 708, y: 336 };
    for (const mount of redoubt.weapons) mount.destroyed = true;
    updateTeamVisions(world);

    expect(lineOfSight(world.terrain, scout.pos, redoubt.pos).clear).toBe(false);
    expect(visionFor(world, scout.team)?.visible.has(redoubt.id)).toBe(false);

    let reacquired = false;
    for (let tick = 0; tick < 200 && !reacquired; tick += 1) {
      stepWorld(world, 9_600);
      reacquired =
        visionFor(world, scout.team)?.visible.has(redoubt.id) === true ||
        scout.targetId === redoubt.id;
    }

    expect(reacquired).toBe(true);
    expect(world.tick).toBeLessThan(200);
  });

  it('keeps a slightly healthier lance focus instead of immediately reversing targets', () => {
    const world = testWorld('focus-hysteresis');
    const shooter = world.entities.find((entity) => entity.team === 0);
    const targets = world.entities.filter((entity) => entity.team === 1).slice(0, 2);
    const [oldFocus, challenger] = targets;
    if (shooter === undefined || oldFocus === undefined || challenger === undefined) {
      throw new Error('need one shooter and two targets');
    }
    isolate(world, [shooter, oldFocus, challenger]);
    const [one, two, three] = clearLine(world, 3);
    if (one === undefined || two === undefined || three === undefined) throw new Error('need positions');
    shooter.pos = one;
    oldFocus.pos = two;
    challenger.pos = three;
    for (const state of Object.values(challenger.locations)) {
      state.armour *= 0.9;
      state.rearArmour *= 0.9;
      state.internal *= 0.9;
    }
    updateTeamVisions(world);
    shooter.ai.focusTargetId = oldFocus.id;
    const tier = difficultyTier(world, 'regular');

    expect(healthFraction(challenger)).toBeLessThan(healthFraction(oldFocus));
    expect(lanceFocus(world, shooter.team, tier)).toBe(oldFocus.id);

    shooter.ai.focusTargetId = null;
    expect(lanceFocus(world, shooter.team, tier)).toBe(challenger.id);
  });

  it('uses a dead band before leaving a committed closing stance', () => {
    const world = testWorld('stance-hysteresis');
    const mech = unitOf(world, 'cairn_battery');
    const target = world.entities.find((entity) => entity.team !== mech.team);
    if (target === undefined) throw new Error('need a target');
    mech.pos = { x: 20, y: 12 };
    const preferred = engagementRange(world, mech, target);
    const tolerance = world.rules.ai.positioning.rangeTolerance;
    target.pos = { x: mech.pos.x + preferred + tolerance / 2, y: mech.pos.y };

    expect(stanceFor(world, mech, target, false, null)).toBe('hold');
    expect(stanceFor(world, mech, target, false, 'close')).toBe('close');
  });

  it('uses a dead band before leaving a committed back-off stance', () => {
    const world = testWorld('back-off-hysteresis');
    const mech = unitOf(world, 'cairn_battery');
    const target = world.entities.find((entity) => entity.team !== mech.team);
    if (target === undefined) throw new Error('need a target');
    mech.pos = { x: 500, y: 500 };
    target.pos = { x: 600, y: 500 };
    const preferred = engagementRange(world, mech, target);
    const tolerance = world.rules.ai.positioning.rangeTolerance;
    target.pos = { x: mech.pos.x + preferred - tolerance / 2, y: mech.pos.y };

    expect(stanceFor(world, mech, target, false, null)).toBe('hold');
    expect(stanceFor(world, mech, target, false, 'back_off')).toBe('back_off');
  });

  it('finishes an active manoeuvre before acting on a non-withdraw stance change', () => {
    const world = testWorld('stance-commitment');
    const mech = unitOf(world, 'cairn_battery');
    const target = world.entities.find((entity) => entity.team !== mech.team);
    if (target === undefined) throw new Error('need a target');
    isolate(world, [mech, target]);
    const [targetAt, from, committedTo] = clearLine(world, 3);
    if (targetAt === undefined || from === undefined || committedTo === undefined) {
      throw new Error('need three positions');
    }
    mech.pos = from;
    target.pos = targetAt;
    updateTeamVisions(world);

    const nextStance = stanceFor(world, mech, target, false, 'close');
    expect(nextStance).not.toBe('close');
    mech.targetId = target.id;
    mech.ai.stance = 'close';
    mech.ai.destination = { ...committedTo };
    mech.ai.commitUntilTick = world.tick + 100;
    mech.path = [{ ...committedTo }];
    mech.pathIndex = 0;

    decideTactical(world, mech, null, difficultyTier(world, 'regular'));

    expect(mech.ai.stance).toBe(nextStance);
    expect(mech.ai.destination).toEqual(committedTo);
    expect(mech.path).toEqual([committedTo]);
  });
});
