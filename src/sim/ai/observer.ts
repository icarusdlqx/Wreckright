import { coverFactorAt, lineOfSight } from '../los';
import { angleDifference, bearing, distance } from '../math';
import { nearestPassable } from '../pathfind';
import { visionFor } from '../sensors';
import {
  isOperational,
  type EntityId,
  type MechEntity,
  type Vec2,
  type World,
} from '../types';
import { usableWeapon, weaponHasLineOfFire } from '../weaponEngagement';
import { exposureAt } from './positioning';
import { roleOf } from './roles';

function hasFireSupport(
  world: World,
  observer: MechEntity,
  factor: number,
  contact?: Vec2,
): boolean {
  const usefulReach = observer.sightRange * factor;
  return world.entities.some((mate) => {
    if (
      mate.id === observer.id ||
      mate.team !== observer.team ||
      !isOperational(mate) ||
      mate.ai.withdrawing
    ) return false;

    return mate.weapons.some((mount) => {
      const weapon = usableWeapon(world, mate, mount, 'intent');
      if (weapon === null) return false;
      const reach = weapon.range.long * world.rules.combat.maxRangeMultiplier;
      if (reach < usefulReach) return false;
      return contact === undefined || (
        distance(mate.pos, contact) <= reach &&
        weaponHasLineOfFire(world, mate.pos, contact, weapon)
      );
    });
  });
}

export function supportedObservationFactor(
  world: World,
  mech: MechEntity,
  contact?: Vec2,
): number {
  const factor = roleOf(world, mech).observationRangeFactor;
  return factor > 0 && hasFireSupport(world, mech, factor, contact) ? factor : 0;
}

/** Optical reach from a proposed perch, using the same authored terrain terms as vision. */
function opticalReachAt(world: World, mech: MechEntity, perch: Vec2, contact: Vec2): number {
  const observerTerrain = world.terrain.typeAtPoint(perch).visionFactor;
  const elevation = world.terrain.elevationAtPoint(perch);
  const vantage =
    observerTerrain * world.rules.combat.elevation.visionPerLevel ** elevation;
  const targetTerrain = world.terrain.typeAtPoint(contact).visionFactor;
  return mech.sightRange * vantage * targetTerrain;
}

function observationBandAt(
  world: World,
  mech: MechEntity,
  perch: Vec2,
  contact: Vec2,
  factor: number,
): number {
  return opticalReachAt(world, mech, perch, contact) * factor;
}

/** Uses the same authored terms as the rest of tactical positioning. */
function observationTerrainScore(world: World, mech: MechEntity, perch: Vec2): number {
  const rules = world.rules.ai.positioning;
  const tile = world.terrain.toTile(perch);
  return (
    (1 - coverFactorAt(world.terrain, perch)) * rules.coverWeight +
    world.terrain.elevationAt(tile.column, tile.row) * rules.elevationWeight -
    exposureAt(world, mech, perch) * rules.approachExposureWeight
  );
}

/** Passable, sighted perches around a contact at this role's authored optical band. */
function observationPerches(
  world: World,
  mech: MechEntity,
  contactId: EntityId,
  contact: Vec2,
  factor: number,
): Vec2[] {
  const directions = world.rules.ai.positioning.candidateDirections;
  const arrival = world.rules.movement.arrivalRadius;
  const snapRadius = Math.max(1, Math.ceil(arrival / world.terrain.tileSize));
  const targetTerrain = world.terrain.typeAtPoint(contact).visionFactor;
  const openBand = mech.sightRange * targetTerrain * factor;
  const perches: Vec2[] = [];
  const occupied = new Set<string>();

  for (let index = 0; index < directions; index += 1) {
    const angle = index / directions * Math.PI * 2;
    const probe = {
      x: contact.x + Math.cos(angle) * openBand,
      y: contact.y + Math.sin(angle) * openBand,
    };
    const adjustedBand = observationBandAt(world, mech, probe, contact, factor);
    const raw = {
      x: contact.x + Math.cos(angle) * adjustedBand,
      y: contact.y + Math.sin(angle) * adjustedBand,
    };
    const tile = world.terrain.toTile(raw);
    const passable = nearestPassable(world.terrain, tile.column, tile.row, snapRadius);
    if (passable === null) continue;
    const key = `${passable.column}:${passable.row}`;
    if (occupied.has(key)) continue;
    const perch = world.terrain.tileCentre(passable.column, passable.row);
    if (distance(perch, contact) > opticalReachAt(world, mech, perch, contact)) continue;
    if (!lineOfSight(world.terrain, perch, contact).clear) continue;
    occupied.add(key);
    perches.push(perch);
  }

  const mates = world.entities.filter(
    (mate) => mate.id !== mech.id && mate.team === mech.team && isOperational(mate),
  );
  if (mates.length === 0) return perches;
  const centre = mates.reduce(
    (sum, mate) => ({ x: sum.x + mate.pos.x / mates.length, y: sum.y + mate.pos.y / mates.length }),
    { x: 0, y: 0 },
  );
  const profile = roleOf(world, mech);
  const approach = bearing(contact, centre);
  const flank = Math.abs(profile.observationFlankDegrees) * Math.PI / 180;
  const flankError = (perch: Vec2): number => {
    const actual = bearing(contact, perch);
    return Math.min(
      Math.abs(angleDifference(approach + flank, actual)),
      Math.abs(angleDifference(approach - flank, actual)),
    );
  };
  const vision = visionFor(world, mech.team);
  const otherContacts = [...(vision?.tracks.values() ?? [])].filter(
    (track) =>
      track.id !== contactId &&
      (vision?.detected.has(track.id) === true || vision?.visible.has(track.id) === true),
  );
  const clearance = (perch: Vec2): number => {
    if (otherContacts.length === 0) return Number.MAX_VALUE;
    let minimum = Number.POSITIVE_INFINITY;
    for (const track of otherContacts) {
      const band = observationBandAt(world, mech, perch, track.pos, factor);
      minimum = Math.min(minimum, distance(perch, track.pos) / band);
    }
    return minimum;
  };
  const safe = perches.filter((perch) => clearance(perch) >= 1);
  const candidates = safe.length > 0 ? safe : perches;
  return candidates.sort((left, right) => {
    const terrain =
      observationTerrainScore(world, mech, right) -
      observationTerrainScore(world, mech, left);
    if (terrain !== 0) return terrain;
    const leftAngle = flankError(left);
    const rightAngle = flankError(right);
    if (leftAngle !== rightAngle) return leftAngle - rightAngle;
    const leftSafety = clearance(left);
    const rightSafety = clearance(right);
    if (leftSafety !== rightSafety) return rightSafety - leftSafety;
    return distance(mech.pos, left) - distance(mech.pos, right);
  });
}

function nearestIndex(from: Vec2, points: readonly Vec2[]): number {
  let nearest = 0;
  for (let index = 1; index < points.length; index += 1) {
    const candidate = distance(from, points[index]!);
    const incumbent = distance(from, points[nearest]!);
    if (candidate < incumbent) nearest = index;
  }
  return nearest;
}

/**
 * Sensor contacts remain coarse. A supported observer approaches their optical
 * ring, then sweeps it instead of turning a grid-cell report into a hidden aim
 * point or walking all the way into its short guns.
 */
export function observationTrackDestination(
  world: World,
  mech: MechEntity,
  contactId: EntityId,
  contact: Vec2,
  sweep: boolean,
): Vec2 | null {
  const factor = supportedObservationFactor(world, mech, contact);
  if (factor === 0) return null;
  const perches = observationPerches(world, mech, contactId, contact, factor);
  if (perches.length === 0) return null;

  const prior = mech.ai.destination;
  if (prior === null) return perches[0] ?? null;
  const previous = nearestIndex(prior, perches);
  const arrived = distance(mech.pos, prior) <= world.rules.movement.arrivalRadius * 2;
  if (!arrived) return perches[previous] ?? null;
  if (!sweep) return perches[0] ?? perches[previous] ?? null;

  return perches.find((_, index) => index !== previous) ?? perches[previous] ?? null;
}

export interface ObservationDirective {
  /** Null means this is already a useful perch and should stay put. */
  destination: Vec2 | null;
}

/** Keeps a supported observer on optics; target selection still lets it fire while repositioning. */
export function observationDirective(
  world: World,
  mech: MechEntity,
  target: MechEntity,
): ObservationDirective | null {
  const factor = supportedObservationFactor(world, mech, target.pos);
  if (factor === 0) return null;

  const perches = observationPerches(world, mech, target.id, target.pos, factor);
  const destination = perches[0];
  const clear = lineOfSight(world.terrain, mech.pos, target.pos).clear;
  const range = distance(mech.pos, target.pos);
  const band = observationBandAt(world, mech, mech.pos, target.pos, factor);
  const saferPerch =
    destination !== undefined &&
    observationTerrainScore(world, mech, destination) >
      observationTerrainScore(world, mech, mech.pos);
  if (
    !saferPerch &&
    clear &&
    Math.abs(range - band) <= world.rules.ai.positioning.rangeTolerance
  ) {
    return { destination: null };
  }

  return destination === undefined ? null : { destination };
}
