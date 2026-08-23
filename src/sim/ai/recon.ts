import { distance } from '../math';
import { nearestPassable } from '../pathfind';
import { visionFor, type ContactTrack } from '../sensors';
import type { MechEntity, Vec2, World } from '../types';
import { observationTrackDestination, supportedObservationFactor } from './observer';

/** How many terrain cells can belong to one authored coarse contact report. */
function trackSearchRadius(world: World): number {
  const uncertainty = Math.max(
    world.rules.sensors.trackGridMetres,
    world.rules.movement.arrivalRadius,
  );
  return Math.ceil(uncertainty / world.terrain.tileSize);
}

/** Picks a contact without consulting the hidden entity behind its track. */
function preferredTrack(world: World, mech: MechEntity): ContactTrack | null {
  const vision = visionFor(world, mech.team);
  if (vision === null) return null;
  const observing = supportedObservationFactor(world, mech) > 0;

  return [...vision.tracks.values()]
    .filter((track) => track.team !== mech.team)
    .sort((left, right) => {
      const current =
        Number(vision.detected.has(right.id) || vision.visible.has(right.id)) -
        Number(vision.detected.has(left.id) || vision.visible.has(left.id));
      if (current !== 0) return current;
      if (observing) {
        const priorities = world.rules.ai.roles.observationClassPriority;
        const priority = priorities[right.chassisClass] - priorities[left.chassisClass];
        if (priority !== 0) return priority;
      }
      const freshness = right.tick - left.tick;
      if (freshness !== 0) return freshness;
      const range = distance(mech.pos, left.pos) - distance(mech.pos, right.pos);
      return range !== 0 ? range : left.id - right.id;
    })[0] ?? null;
}

/**
 * A deterministic search point derived only from a quantized sensor report.
 * Once the coarse cell is reached, successive commitments sweep its perimeter
 * so terrain cannot leave two sensor-aware lances waiting behind the same hill.
 */
export function reconDestination(world: World, mech: MechEntity): Vec2 | null {
  const track = preferredTrack(world, mech);
  if (track === null) return null;

  const vision = visionFor(world, mech.team);
  const observation = observationTrackDestination(
    world,
    mech,
    track.id,
    track.pos,
    vision?.visible.has(track.id) !== true,
  );
  if (observation !== null) return observation;

  const trackTile = world.terrain.toTile(track.pos);
  const searchRadius = trackSearchRadius(world);
  const passableTrack = nearestPassable(
    world.terrain,
    trackTile.column,
    trackTile.row,
    searchRadius,
  );
  if (passableTrack === null) return null;
  const centre = world.terrain.tileCentre(passableTrack.column, passableTrack.row);
  const arrival = world.rules.movement.arrivalRadius;
  if (distance(mech.pos, centre) > arrival) {
    return { x: centre.x, y: centre.y };
  }

  const directions = world.rules.ai.positioning.candidateDirections;
  const radius = Math.max(world.rules.sensors.trackGridMetres, arrival);
  const candidates: Vec2[] = [];
  const occupied = new Set<string>();

  for (let index = 0; index < directions; index += 1) {
    const angle = index / directions * Math.PI * 2;
    const raw = {
      x: track.pos.x + Math.cos(angle) * radius,
      y: track.pos.y + Math.sin(angle) * radius,
    };
    const tile = world.terrain.toTile(raw);
    const passable = nearestPassable(
      world.terrain,
      tile.column,
      tile.row,
      searchRadius,
    );
    if (passable === null) continue;
    const key = `${passable.column}:${passable.row}`;
    if (occupied.has(key)) continue;
    occupied.add(key);
    candidates.push(world.terrain.tileCentre(passable.column, passable.row));
  }

  if (candidates.length === 0) return { x: centre.x, y: centre.y };
  const prior = mech.ai.destination;
  if (prior === null || distance(prior, centre) <= arrival) {
    return candidates[(track.id + mech.id) % candidates.length] ?? candidates[0] ?? null;
  }

  let nearest = 0;
  for (let index = 1; index < candidates.length; index += 1) {
    if (distance(prior, candidates[index]!) < distance(prior, candidates[nearest]!)) {
      nearest = index;
    }
  }
  return candidates[(nearest + 1) % candidates.length] ?? candidates[0] ?? null;
}
