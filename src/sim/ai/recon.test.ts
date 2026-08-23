import { describe, expect, it } from 'vitest';
import { makeGrid, OPEN_LEGEND, playerWorld, testWorld } from '../../../tests/support';
import { updateDesignation } from '../designation';
import { issueAttack } from '../orders';
import { visionFor, type ContactTrack } from '../sensors';
import type { MechEntity, Vec2, World } from '../types';
import { stepWorld } from '../world';
import { decideBaseline } from './baseline';
import { lanceFocus } from './focus';
import { reconDestination } from './recon';
import { decideTactical, difficultyTier } from './tactical';
import { scoreTargets } from './utility';

interface ContactFixture {
  world: World;
  mech: MechEntity;
  target: MechEntity;
  track: ContactTrack;
}

function contactFixture(seed: string, trackPos?: Vec2): ContactFixture {
  const world = testWorld(seed);
  const mech = world.entities.find((entity) => entity.team === 0);
  const target = world.entities.find((entity) => entity.team !== 0);
  if (mech === undefined || target === undefined) throw new Error('need opposing mechs');
  for (const entity of world.entities) entity.destroyed = entity !== mech && entity !== target;

  const vision = visionFor(world, mech.team);
  if (vision === null) throw new Error('need a team vision');
  vision.visible.clear();
  vision.identified.clear();
  vision.detected.clear();
  vision.tracks.clear();

  const pos = trackPos ?? {
    x: Math.floor(target.pos.x / world.rules.sensors.trackGridMetres) *
      world.rules.sensors.trackGridMetres + world.rules.sensors.trackGridMetres / 2,
    y: Math.floor(target.pos.y / world.rules.sensors.trackGridMetres) *
      world.rules.sensors.trackGridMetres + world.rules.sensors.trackGridMetres / 2,
  };
  const track: ContactTrack = {
    id: target.id,
    team: target.team,
    frame: target.frame,
    chassisClass: target.chassisClass,
    pos,
    tick: world.tick,
    source: 'sensor',
  };
  vision.detected.add(target.id);
  vision.tracks.set(target.id, track);
  return { world, mech, target, track };
}

describe('privacy-safe recon', () => {
  it('keeps an impassable coarse-track search inside its authored uncertainty', () => {
    const trackPos = { x: 125, y: 75 };
    const { world, mech, track } = contactFixture('recon-bounded-track', trackPos);
    const tileSize = 10;
    const width = 25;
    const height = 15;
    const trackColumn = Math.floor(track.pos.x / tileSize);
    const trackRow = Math.floor(track.pos.y / tileSize);
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
    const destination = reconDestination(world, mech);
    expect(destination).not.toBeNull();
    if (destination === null) return;
    const destinationTile = world.terrain.toTile(destination);
    expect(world.terrain.passable(destinationTile.column, destinationTile.row)).toBe(true);
    expect(
      Math.max(
        Math.abs(destinationTile.column - trackColumn),
        Math.abs(destinationTile.row - trackRow),
      ),
    ).toBeLessThanOrEqual(searchRadius);

    world.terrain = grid(searchRadius);
    expect(reconDestination(world, mech)).toBeNull();
  });

  it('uses the same coarse destination when hidden exact state changes', () => {
    const first = contactFixture('recon-hidden');
    const second = contactFixture('recon-hidden', first.track.pos);

    first.target.pos = { x: 50, y: 50 };
    second.target.pos = { x: 1_200, y: 800 };
    second.target.runSpeed *= 3;
    second.target.weapons.length = 0;
    for (const location of Object.values(second.target.locations)) {
      location.armour = 0;
      location.internal = Math.max(1, location.internal * 0.05);
    }

    expect(reconDestination(first.world, first.mech)).toEqual(
      reconDestination(second.world, second.mech),
    );

    decideBaseline(first.world, first.mech);
    decideBaseline(second.world, second.mech);

    expect(first.mech.targetId).toBeNull();
    expect(second.mech.targetId).toBeNull();
    expect(first.mech.ai.destination).toEqual(second.mech.ai.destination);
    expect(first.mech.path).toEqual(second.mech.path);
  });

  it('investigates a sensor track, then promotes it only after optical sight', () => {
    const { world, mech, target } = contactFixture('recon-promote');
    const tier = difficultyTier(world, 'regular');

    expect(scoreTargets(world, mech, { focusTargetId: target.id, currentTargetId: target.id }))
      .toEqual([]);
    expect(lanceFocus(world, mech.team, tier)).toBeNull();

    decideTactical(world, mech, target.id, tier);
    expect(mech.targetId).toBeNull();
    expect(mech.path.length).toBeGreaterThan(0);

    const vision = visionFor(world, mech.team);
    if (vision === null) throw new Error('need a team vision');
    target.pos = { x: mech.pos.x + 100, y: mech.pos.y };
    vision.visible.add(target.id);
    vision.identified.add(target.id);

    decideTactical(world, mech, target.id, tier);
    expect(mech.targetId).toBe(target.id);
  });

  it('rejects sensor-only direct selection and called shots', () => {
    const { world, mech, target } = contactFixture('recon-order');

    expect(issueAttack(world, mech, target.id, 'left_arm')).toBe(false);
    expect(mech.orders.attack).toBeNull();
    expect(mech.targetId).toBeNull();
    expect(mech.calledShot).toBeNull();

    const vision = visionFor(world, mech.team);
    if (vision === null) throw new Error('need a team vision');
    vision.visible.add(target.id);

    expect(issueAttack(world, mech, target.id, 'left_arm')).toBe(true);
    expect(mech.orders.attack).toEqual({ targetId: target.id, calledShot: 'left_arm' });
    expect(mech.targetId).toBe(target.id);
    expect(mech.calledShot).toBe('left_arm');
  });

  it('does not let a designator paint a sensor-only contact', () => {
    const { world, mech, target } = contactFixture('recon-designator');
    mech.designatorRange = 2_000;
    mech.designatorSeconds = 5;
    mech.targetId = target.id;

    updateDesignation(world);
    expect(target.designatedUntilTick).toBeLessThanOrEqual(world.tick);

    const vision = visionFor(world, mech.team);
    if (vision === null) throw new Error('need a team vision');
    target.pos = { x: mech.pos.x + 100, y: mech.pos.y };
    vision.visible.add(target.id);
    updateDesignation(world);
    expect(target.designatedUntilTick).toBeGreaterThan(world.tick);
  });

  it('clears unseen live targets for every controller but keeps tracked player intent', () => {
    const world = playerWorld('all-controller-contact-loss');
    const allies = world.entities.filter((entity) => entity.team === world.playerTeam).slice(0, 3);
    const target = world.entities.find((entity) => entity.team !== world.playerTeam);
    if (allies.length < 3 || target === undefined) throw new Error('need three allies and a target');
    const [ordered, baseline, tactical] = allies;
    if (ordered === undefined || baseline === undefined || tactical === undefined) {
      throw new Error('need three controllers');
    }

    ordered.controller = 'orders';
    ordered.orders.attack = { targetId: target.id, calledShot: 'left_arm' };
    const orderedVision = visionFor(world, ordered.team);
    if (orderedVision === null) throw new Error('need an ordered-team vision');
    orderedVision.tracks.set(target.id, {
      id: target.id,
      team: target.team,
      frame: target.frame,
      chassisClass: target.chassisClass,
      pos: { x: target.pos.x, y: target.pos.y },
      tick: world.tick,
      source: 'optical',
    });
    baseline.controller = 'baseline';
    tactical.controller = 'tactical';
    tactical.ai.focusTargetId = target.id;
    for (const mech of allies) {
      mech.sightRange = 0;
      mech.targetId = target.id;
      mech.calledShot = 'left_arm';
    }

    stepWorld(world, world.tick + 100);

    for (const mech of allies) {
      expect(mech.targetId, mech.controller).toBeNull();
      expect(mech.calledShot, mech.controller).toBeNull();
    }
    expect(tactical.ai.focusTargetId).toBeNull();
    expect(ordered.orders.attack).toEqual({ targetId: target.id, calledShot: 'left_arm' });
  });
});
