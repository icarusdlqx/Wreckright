import { describe, expect, it } from 'vitest';
import { makeGrid, OPEN_LEGEND, testWorld, unitOf } from '../../../tests/support';
import { updateWeapons } from '../combat';
import { eventsOfType } from '../events';
import { lineOfSight } from '../los';
import { angleDifference, bearing, distance } from '../math';
import { effectiveSightRange, updateTeamVisions, visionFor } from '../sensors';
import type { MechEntity, World } from '../types';
import {
  observationDirective,
  observationTrackDestination,
  supportedObservationFactor,
} from './observer';
import { reconDestination } from './recon';
import { roleOf } from './roles';
import { exposureAt } from './positioning';
import { decideTactical, difficultyTier } from './tactical';

interface ObserverFixture {
  world: World;
  scout: MechEntity;
  support: MechEntity;
  target: MechEntity;
}

function fixture(seed: string): ObserverFixture {
  const world = testWorld(seed);
  const scout = unitOf(world, 'hornet_spotter');
  const support = unitOf(world, 'cairn_battery');
  const target = unitOf(world, 'wisp_scout');
  for (const entity of world.entities) {
    entity.destroyed = entity !== scout && entity !== support && entity !== target;
  }
  world.terrain = makeGrid({
    legend: OPEN_LEGEND,
    tiles: Array.from({ length: 30 }, () => '.'.repeat(100)),
  });
  scout.pos = { x: 100, y: 145 };
  support.pos = { x: 75, y: 145 };
  support.sightRange = 2_000;
  target.pos = { x: 500, y: 145 };
  scout.facing = 0;
  scout.torsoOffset = 0;
  updateTeamVisions(world);
  return { world, scout, support, target };
}

function scoutWeaponReach(world: World, scout: MechEntity): number {
  return Math.max(
    ...scout.weapons.map(
      (mount) => world.catalog.weapons.get(mount.weaponId)?.range.long ?? 0,
    ),
  ) * world.rules.combat.maxRangeMultiplier;
}

interface ExposureChoice {
  exposure: number;
  hand: number;
  safeHand: number;
  unshieldedExposure: number;
}

/** Mirrors only known geometry; no hidden entity position enters the choice. */
function exposureChoice(seed: string, shieldOpposite: boolean): ExposureChoice {
  const { world, scout, support, target } = fixture(seed);
  const threat = unitOf(world, 'halberd_prime');
  const size = 200;
  world.terrain = makeGrid({
    legend: OPEN_LEGEND,
    tiles: Array.from({ length: size }, () => '.'.repeat(size)),
  });
  scout.pos = { x: 500, y: 984 };
  support.pos = { x: 475, y: 984 };
  support.sightRange = 2_000;
  target.pos = { x: 984, y: 984 };
  updateTeamVisions(world);
  let track = visionFor(world, scout.team)?.tracks.get(target.id);
  if (track === undefined) throw new Error('need the primary contact');
  const initial = observationTrackDestination(world, scout, track.id, track.pos, false);
  if (initial === null) throw new Error('need an initial flank');
  const opposite = { x: initial.x, y: track.pos.y * 2 - initial.y };

  threat.destroyed = false;
  threat.pos = { x: 584, y: track.pos.y };
  const directMount = threat.weapons[0];
  if (directMount === undefined) throw new Error('need a threat mount');
  threat.weapons = [{ ...directMount, weaponId: 'er_ppc' }];
  threat.ammoBins = [];
  const shielded = shieldOpposite ? opposite : initial;
  const blocker = {
    column: Math.floor(((threat.pos.x + shielded.x) / 2) / 10),
    row: Math.floor(((threat.pos.y + shielded.y) / 2) / 10),
  };
  const tiles = Array.from({ length: size }, () => '.'.repeat(size).split(''));
  for (let row = blocker.row - 1; row <= blocker.row + 1; row += 1) {
    for (let column = blocker.column - 1; column <= blocker.column + 1; column += 1) {
      const cells = tiles[row];
      if (cells !== undefined) cells[column] = 'b';
    }
  }
  world.terrain = makeGrid({
    legend: OPEN_LEGEND,
    tiles: tiles.map((row) => row.join('')),
  });
  updateTeamVisions(world);
  track = visionFor(world, scout.team)?.tracks.get(target.id);
  if (track === undefined) throw new Error('need the primary contact after terrain changes');
  const chosen = observationTrackDestination(world, scout, track.id, track.pos, false);
  if (chosen === null) throw new Error('need an exposure-aware flank');
  const unshielded = shieldOpposite ? initial : opposite;

  return {
    exposure: exposureAt(world, scout, chosen),
    hand: Math.sign(chosen.y - track.pos.y),
    safeHand: Math.sign(shielded.y - track.pos.y),
    unshieldedExposure: exposureAt(world, scout, unshielded),
  };
}

describe('forward observer behaviour', () => {
  it('investigates a contact on its authored optical band instead of at gun range', () => {
    const { world, scout, target } = fixture('observer-band');
    world.atmosphere = {
      ...world.atmosphere,
      mechanics: { ...world.atmosphere.mechanics, sightFactor: 0.8 },
    };
    updateTeamVisions(world);
    const track = visionFor(world, scout.team)?.tracks.get(target.id);
    if (track === undefined) throw new Error('need a contact track');

    const destination = reconDestination(world, scout);
    if (destination === null) throw new Error('need an observation destination');
    const factor = roleOf(world, scout).observationRangeFactor;
    const sightRange = effectiveSightRange(world, scout);
    const band = sightRange * factor;

    expect(distance(destination, track.pos)).toBeGreaterThan(band - world.terrain.tileSize * 2);
    expect(distance(destination, track.pos)).toBeLessThan(sightRange);
    expect(distance(destination, track.pos)).toBeGreaterThan(scoutWeaponReach(world, scout));

    decideTactical(world, scout, null, difficultyTier(world, 'regular'));
    expect(scout.ai.destination).toEqual(destination);
    expect(distance(scout.ai.destination!, track.pos)).toBeGreaterThan(
      scoutWeaponReach(world, scout),
    );
  });

  it('uses either hand of the authored flank angle when every perch is equally safe', () => {
    const { world, scout, support, target } = fixture('observer-flank');
    world.terrain = makeGrid({
      legend: OPEN_LEGEND,
      tiles: Array.from({ length: 100 }, () => '.'.repeat(100)),
    });
    scout.pos = { x: 100, y: 500 };
    support.pos = { x: 75, y: 500 };
    target.pos = { x: 500, y: 500 };
    updateTeamVisions(world);
    const track = visionFor(world, scout.team)?.tracks.get(target.id);
    if (track === undefined) throw new Error('need a contact track');

    const destination = observationTrackDestination(world, scout, track.id, track.pos, false);
    if (destination === null) throw new Error('need an observation destination');
    const profile = roleOf(world, scout);
    const approach = bearing(track.pos, support.pos);
    const flank = Math.abs(profile.observationFlankDegrees) * Math.PI / 180;
    const actual = bearing(track.pos, destination);
    const halfCandidateStep = Math.PI / world.rules.ai.positioning.candidateDirections;

    expect(Math.min(
      Math.abs(angleDifference(approach + flank, actual)),
      Math.abs(angleDifference(approach - flank, actual)),
    )).toBeLessThan(
      halfCandidateStep + world.terrain.tileSize / distance(track.pos, destination),
    );
    expect(destination).not.toEqual({
      x: track.pos.x + distance(track.pos, destination),
      y: track.pos.y,
    });
  });

  it('prefers a lower-exposure perch to the default flank', () => {
    const choice = exposureChoice('observer-exposure', true);

    expect(choice.unshieldedExposure).toBeGreaterThan(choice.exposure);
    expect(choice.hand).toBe(choice.safeHand);
  });

  it('makes the same safety choice when the physical flank is mirrored', () => {
    const lower = exposureChoice('observer-mirror-lower', false);
    const upper = exposureChoice('observer-mirror-upper', true);

    expect(lower.exposure).toBe(0);
    expect(upper.exposure).toBe(0);
    expect(lower.hand).toBe(lower.safeHand);
    expect(upper.hand).toBe(upper.safeHand);
    expect(lower.hand).toBe(-upper.hand);
  });

  it('accepts an indirect battery behind cover as useful optical fire support', () => {
    const { world, scout, support, target } = fixture('observer-indirect-support');
    world.terrain = makeGrid({
      legend: OPEN_LEGEND,
      tiles: Array.from({ length: 70 }, (_, row) => {
        const cells = '.'.repeat(70).split('');
        if (row >= 20 && row <= 50) cells[30] = 'b';
        return cells.join('');
      }),
    });
    support.pos = { x: 105, y: 405 };
    target.pos = { x: 505, y: 405 };
    scout.pos = { x: 405, y: 105 };
    scout.sightRange = 500;
    updateTeamVisions(world);

    expect(lineOfSight(world.terrain, support.pos, target.pos).clear).toBe(false);
    expect(visionFor(world, scout.team)?.visible.has(target.id)).toBe(true);
    expect(supportedObservationFactor(world, scout, target.pos)).toBeGreaterThan(0);

    const mount = support.weapons[0];
    if (mount === undefined) throw new Error('need a support mount');
    support.weapons = [{ ...mount, weaponId: 'large_laser' }];
    support.ammoBins = [];
    expect(supportedObservationFactor(world, scout, target.pos)).toBe(0);
  });

  it('falls back to closing a contact when no lancemate can exploit the sightline', () => {
    const { world, scout, support, target } = fixture('observer-lone');
    support.destroyed = true;
    updateTeamVisions(world);
    const track = visionFor(world, scout.team)?.tracks.get(target.id);
    if (track === undefined) throw new Error('need a contact track');

    const destination = reconDestination(world, scout);
    if (destination === null) throw new Error('need a search destination');
    expect(distance(destination, track.pos)).toBeLessThan(world.terrain.tileSize * 2);
  });

  it('does not mistake another short battery for useful fire support', () => {
    const { world, scout, support, target } = fixture('observer-short-support');
    const shortMount = scout.weapons.find((mount) => mount.weaponId === 'flamer');
    if (shortMount === undefined) throw new Error('need a short gun');
    support.weapons = [{ ...shortMount }];
    support.ammoBins = [];
    const track = visionFor(world, scout.team)?.tracks.get(target.id);
    if (track === undefined) throw new Error('need a contact track');

    const destination = reconDestination(world, scout);
    if (destination === null) throw new Error('need a search destination');
    expect(distance(destination, track.pos)).toBeLessThan(world.terrain.tileSize * 2);
  });

  it('keeps a perch clear of a second current contact', () => {
    const { world, scout, target } = fixture('observer-contact-clearance');
    const vision = visionFor(world, scout.team);
    const track = vision?.tracks.get(target.id);
    if (vision === null || vision === undefined || track === undefined) {
      throw new Error('need a contact track');
    }
    const first = observationTrackDestination(world, scout, track.id, track.pos, false);
    if (first === null) throw new Error('need an initial perch');

    vision.detected.add(99);
    vision.tracks.set(99, {
      id: 99,
      team: target.team,
      frame: target.frame,
      chassisClass: target.chassisClass,
      pos: { ...first },
      tick: world.tick,
      source: 'sensor',
    });
    scout.ai.destination = null;
    const safer = observationTrackDestination(world, scout, track.id, track.pos, false);
    if (safer === null) throw new Error('need a safer perch');

    expect(safer).not.toEqual(first);
    expect(distance(safer, first)).toBeGreaterThanOrEqual(
      effectiveSightRange(world, scout) * roleOf(world, scout).observationRangeFactor,
    );
  });

  it('holds an optical perch and sweeps a sensor-only ring geometrically', () => {
    const { world, scout, target } = fixture('observer-sweep');
    const track = visionFor(world, scout.team)?.tracks.get(target.id);
    if (track === undefined) throw new Error('need a contact track');
    const first = observationTrackDestination(world, scout, track.id, track.pos, false);
    if (first === null) throw new Error('need an initial perch');
    scout.ai.destination = { ...first };
    scout.pos = { ...first };

    expect(observationTrackDestination(world, scout, track.id, track.pos, false)).toEqual(first);
    expect(observationTrackDestination(world, scout, track.id, track.pos, true)).not.toEqual(first);
  });

  it('holds a clear observation perch and keeps the same band while its guns engage', () => {
    const { world, scout, target } = fixture('observer-fight');
    const factor = roleOf(world, scout).observationRangeFactor;
    scout.pos = {
      x: target.pos.x - effectiveSightRange(world, scout) * factor,
      y: target.pos.y,
    };

    expect(observationDirective(world, scout, target)).toEqual({ destination: null });

    scout.pos = { x: target.pos.x - scoutWeaponReach(world, scout) + 5, y: target.pos.y };
    const armed = observationDirective(world, scout, target);
    expect(armed?.destination).not.toBeNull();

    scout.groupEnabled.fill(false);
    expect(observationDirective(world, scout, target)).toEqual(armed);
  });

  it('joins the fight when a clear target enters enabled weapon reach', () => {
    const { world, scout, target } = fixture('observer-shoots');
    scout.pos = { x: 300, y: 145 };
    target.pos = { x: 450, y: 145 };
    updateTeamVisions(world);

    decideTactical(world, scout, null, difficultyTier(world, 'regular'));
    expect(scout.targetId).toBe(target.id);
    updateWeapons(world, scout);
    expect(
      eventsOfType(world.events, 'weapon_fired').some(
        (event) => event.shooterId === scout.id && event.targetId === target.id,
      ),
    ).toBe(true);
  });
});
