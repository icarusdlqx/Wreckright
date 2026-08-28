import { distance } from './math';
import { replacePath } from './pathProgress';
import { findPath, nearestPassable } from './pathfind';
import { currentSensorTrack, isSightedBy, trackFor, visionFor } from './sensors';
import { findEntity, isOperational, type MechEntity, type Vec2, type World } from './types';
import {
  hasUsableFiringSolution,
  hasUsableLineOfFire,
  longestUsableWeaponMaximumReach,
  longestUsableWeaponReach,
} from './weaponEngagement';

/** Bounds an investigation to the authored uncertainty of one sensor report. */
function trackSearchRadius(world: World): number {
  const uncertainty = Math.max(
    world.rules.sensors.trackGridMetres,
    world.rules.movement.arrivalRadius,
  );
  return Math.ceil(uncertainty / world.terrain.tileSize);
}

export interface OrderedContact {
  /** Exact entity state is exposed only while the team has optical sight. */
  target: MechEntity | null;
  /** A detected contact addressable now, without exposing its hidden entity state. */
  indirectTargetId: number | null;
  /** A privacy-safe point the standing order may continue to investigate. */
  lastKnown: Vec2 | null;
  /** The team has actually observed that this contact is no longer fighting. */
  gone: boolean;
}

/** Separates the player's standing order from the live contact it may have lost. */
export function orderedContact(world: World, entity: MechEntity): OrderedContact {
  const id = entity.orders.attack?.targetId ?? null;
  const vision = visionFor(world, entity.team);
  const found = findEntity(world, id);
  const target =
    found !== null && isSightedBy(vision, found) && isOperational(found) ? found : null;
  const indirectTargetId =
    target === null &&
    found !== null &&
    currentSensorTrack(vision, found) !== null &&
    isOperational(found) &&
    hasUsableFiringSolution(world, entity, found, 'intent')
      ? found.id
      : null;
  const track = id === null ? null : trackFor(vision, id);
  const gone =
    found !== null &&
    vision?.observedHulks.has(found.id) === true &&
    !isOperational(found);
  return {
    target,
    indirectTargetId,
    lastKnown: track === null ? null : { x: track.pos.x, y: track.pos.y },
    gone,
  };
}

export function autoAcquire(world: World, entity: MechEntity): MechEntity | null {
  let best: MechEntity | null = null;
  let bestRange = Number.POSITIVE_INFINITY;
  const vision = visionFor(world, entity.team);

  for (const candidate of world.entities) {
    if (candidate.team === entity.team) continue;
    if (!isSightedBy(vision, candidate)) continue;
    if (!isOperational(candidate)) continue;
    if (!hasUsableLineOfFire(world, entity, candidate, 'intent')) continue;

    const range = distance(entity.pos, candidate.pos);
    if (range < bestRange) {
      best = candidate;
      bestRange = range;
    }
  }

  return best;
}

/** The longest reach of any working gun aboard, in metres. */
/**
 * Walks an attack-ordered mech into the fight: toward its quarry until it is
 * inside most of its longest gun's reach with a line of sight, then stops to
 * shoot from there rather than marching on to point blank. Returns true while
 * the approach is still walking; false hands the feet back to whoever called.
 */
export function approachToEngage(
  world: World,
  entity: MechEntity,
  quarry: MechEntity,
): boolean {
  const reach = longestUsableWeaponReach(world, entity, 'intent', quarry.pos);
  // Nothing to shoot with: charging a machine you cannot hurt is not an
  // approach, it is a donation.
  if (reach <= 0) return false;

  const gap = distance(entity.pos, quarry.pos);
  const solution = hasUsableLineOfFire(world, entity, quarry, 'intent');
  if (gap <= reach * 0.85 && solution) return false;

  if (entity.path.length === 0 || world.tick >= entity.nextPathTick) {
    const path = findPath(
      world.terrain,
      entity.pos,
      quarry.pos,
      world.rules.simulation.pathfindMaxNodes,
    );
    entity.nextPathTick = world.tick + world.rules.simulation.aiPathIntervalTicks;
    replacePath(entity, path ?? []);
  }
  if (entity.path.length === 0) return false;

  entity.motion = 'walk';
  entity.intendedMotion = 'walk';
  return true;
}

/** Searches a coarse contact report without learning the hidden machine's position. */
export function approachToLastKnown(
  world: World,
  entity: MechEntity,
  lastKnown: Vec2,
): boolean {
  const reportedTile = world.terrain.toTile(lastKnown);
  const passable = nearestPassable(
    world.terrain,
    reportedTile.column,
    reportedTile.row,
    trackSearchRadius(world),
  );
  if (passable === null) return false;
  const destination = world.terrain.tileCentre(passable.column, passable.row);
  if (distance(entity.pos, destination) <= world.rules.movement.arrivalRadius) return false;

  const currentEnd = entity.path.at(-1);
  const routeChanged =
    currentEnd === undefined ||
    distance(currentEnd, destination) > world.rules.movement.arrivalRadius;
  if (routeChanged || world.tick >= entity.nextPathTick) {
    const path = findPath(
      world.terrain,
      entity.pos,
      destination,
      world.rules.simulation.pathfindMaxNodes,
    );
    entity.nextPathTick = world.tick + world.rules.simulation.aiPathIntervalTicks;
    replacePath(
      entity,
      path === null ? [] : path.length === 0 ? [{ ...destination }] : path,
    );
  }
  if (entity.path.length === 0) return false;

  entity.motion = 'walk';
  entity.intendedMotion = 'walk';
  return true;
}

/** Applies a firing solution without consuming or exposing a hidden standing order. */
export function applyPlayerTargeting(
  world: World,
  entity: MechEntity,
  contact: OrderedContact,
  holdingFire: boolean,
): void {
  const attackMoving = entity.orders.move?.engage === true;
  const orderedTargetId = contact.target?.id ?? contact.indirectTargetId;
  const orderedTargetActionable =
    contact.target !== null &&
    hasUsableFiringSolution(world, entity, contact.target, 'intent');
  if (orderedTargetId !== null && (!attackMoving || orderedTargetActionable)) {
    entity.targetId = orderedTargetId;
    entity.calledShot = contact.target === null ? null : (entity.orders.attack?.calledShot ?? null);
    return;
  }

  if (orderedTargetId === null && (contact.gone || contact.lastKnown === null)) {
    // Once both optical contact and its bounded report have elapsed, the
    // standing id carries no player-visible information. Retire it so normal
    // target selection can resume without asking what the hidden entity did.
    entity.orders.attack = null;
  }

  if (!holdingFire && attackMoving) {
    const passingTarget = engageWorthTarget(world, entity);
    if (passingTarget !== null) {
      // Attack-move stopped because this mech can shoot the passing contact.
      // Use it as the live solution without replacing the player's standing
      // intent; the ordered quarry takes over again when optical sight returns.
      entity.targetId = passingTarget.id;
      entity.calledShot = null;
      return;
    }
  }

  if (orderedTargetId !== null) {
    entity.targetId = orderedTargetId;
    entity.calledShot = contact.target === null ? null : (entity.orders.attack?.calledShot ?? null);
    return;
  }

  // Losing optical contact strips the live firing solution, not the player's
  // standing intent. The order may keep walking to its privacy-safe track and
  // becomes live again only after optical promotion.
  if (entity.orders.attack !== null) {
    entity.targetId = null;
    entity.calledShot = null;
    return;
  }

  entity.calledShot = null;
  if (holdingFire) {
    entity.targetId = null;
    return;
  }

  if (entity.posture === 'return_fire') {
    const threat = findEntity(world, entity.threatenedBy);
    const remembered = world.tick <= entity.threatenedUntilTick;
    entity.targetId =
      remembered &&
      threat !== null &&
      isSightedBy(visionFor(world, entity.team), threat) &&
      hasUsableLineOfFire(world, entity, threat, 'intent') &&
      isOperational(threat)
        ? threat.id
        : null;
    return;
  }

  entity.targetId = autoAcquire(world, entity)?.id ?? null;
}

/**
 * The contact an attack-moving mech should stop for: something visible and
 * inside the reach of a gun it is actually carrying. Passing sensor tracks do
 * not halt an advance; a target worth shooting does.
 */
export function engageWorthTarget(world: World, entity: MechEntity): MechEntity | null {
  const reach = longestUsableWeaponMaximumReach(world, entity, 'intent', entity.pos);
  if (reach === 0) return null;

  let best: MechEntity | null = null;
  let bestRange = Number.POSITIVE_INFINITY;
  const vision = visionFor(world, entity.team);

  for (const candidate of world.entities) {
    if (candidate.team === entity.team) continue;
    if (!isSightedBy(vision, candidate)) continue;
    if (!isOperational(candidate)) continue;

    const range = distance(entity.pos, candidate.pos);
    const candidateReach = longestUsableWeaponMaximumReach(
      world,
      entity,
      'intent',
      candidate.pos,
    );
    if (range > candidateReach || range >= bestRange) continue;
    if (!hasUsableFiringSolution(world, entity, candidate, 'intent')) continue;

    best = candidate;
    bestRange = range;
  }

  return best;
}
