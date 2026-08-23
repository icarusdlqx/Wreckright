import { passableAt } from './movement';
import { isOperational, type MechEntity, type Vec2, type World } from './types';

/** Below this, an asymptotic separation tail is neither motion nor visible. */
const CONTACT_EPSILON = 1e-5;

/**
 * How much ground a mech stands on. Mirrors the radius the renderer draws a
 * hull at — see `radiusFor` in render/shape.ts, which a test pins to this.
 */
export function bodyRadius(world: World, entity: MechEntity): number {
  const rules = world.rules.movement;
  return rules.bodyRadiusBase + entity.tonnage * rules.bodyRadiusPerTon;
}

/**
 * Keeps two mechs out of the same spot.
 *
 * Nothing else in the simulation stops a mech walking into another one: the
 * pathfinder works off terrain, and two machines converging on the same
 * waypoint will happily stand inside each other until they are one silhouette.
 *
 * Contact is resolved as a shove, not a wall. Blocking the step outright makes
 * a lance jam solid in a doorway, and snapping the overlap out in a single tick
 * throws mechs across the map when three of them meet. Each pair pushes apart
 * by a share of the overlap, weighted by mass — a hundred-tonne assault barely
 * notices a scout, and the scout gives way.
 *
 * Wrecks are ignored deliberately. A destroyed mech stops being an obstacle, so
 * a lance is never walled in by its own dead.
 */
export function separateBodies(
  world: World,
  tickStarts: ReadonlyMap<number, Vec2> | null = null,
): void {
  const standing = world.entities.filter(
    (entity) => isOperational(entity) && entity.jump === null && !entity.destroyed,
  );
  if (standing.length < 2) return;

  const collisionStarts = new Map(standing.map((entity) => [entity.id, { ...entity.pos }]));
  const displaced = new Set<number>();
  const rate = world.rules.movement.separationRate;
  separatePass(world, standing, rate, false, displaced);
  // A bounded second pass catches genuine lance pile-ups and deep two-body
  // compression, such as a jump landing beside a moving lancemate. Shallow
  // formation contact stays on the authored single-pass shove: that avoids
  // turning ordinary shoulder contact into stop/start path motion.
  separatePass(world, standing, rate, true, displaced);

  for (const entity of standing) {
    if (!displaced.has(entity.id)) continue;
    const start = tickStarts?.get(entity.id) ?? collisionStarts.get(entity.id);
    if (start === undefined) continue;
    const moved = Math.hypot(entity.pos.x - start.x, entity.pos.y - start.y) > CONTACT_EPSILON;
    // Collision displacement is movement for both presentation and gunnery. A
    // pilot shoved sideways is not receiving the stationary accuracy bonus.
    entity.motion = moved ? (entity.motion === 'stationary' ? 'walk' : entity.motion) : 'stationary';
  }
}

function separatePass(
  world: World,
  standing: readonly MechEntity[],
  rate: number,
  selectivePass: boolean,
  displaced: Set<number>,
): void {
  for (let index = 0; index < standing.length; index += 1) {
    for (let other = index + 1; other < standing.length; other += 1) {
      const a = standing[index];
      const b = standing[other];
      if (a === undefined || b === undefined) continue;
      const clearance = bodyRadius(world, a) + bodyRadius(world, b);
      let dx = b.pos.x - a.pos.x;
      let dy = b.pos.y - a.pos.y;
      let gap = Math.hypot(dx, dy);
      if (gap >= clearance) continue;
      if (selectivePass) {
        if (a.team !== b.team) continue;
        const deeplyCompressed = clearance - gap > world.rules.movement.arrivalRadius;
        if (
          !deeplyCompressed &&
          !inSameTeamPileup(world, standing, a) &&
          !inSameTeamPileup(world, standing, b)
        ) continue;
      }

      if (gap < 1e-6) {
        // Exactly stacked. Any direction will do, so long as it is the same one
        // every run: the simulation has to replay identically from a seed.
        dx = Math.cos(a.facing);
        dy = Math.sin(a.facing);
        gap = 1;
      }

      const overlap = (clearance - gap) * rate;
      const unitX = dx / gap;
      const unitY = dy / gap;

      const [shareA, shareB] = separationShares(a, b);
      if (nudge(world, a, -unitX * overlap * shareA, -unitY * overlap * shareA)) {
        displaced.add(a.id);
      }
      if (nudge(world, b, unitX * overlap * shareB, unitY * overlap * shareB)) {
        displaced.add(b.id);
      }
    }
  }
}

/** A second contact makes this a pile-up rather than ordinary shoulder compression. */
function inSameTeamPileup(
  world: World,
  standing: readonly MechEntity[],
  candidate: MechEntity,
): boolean {
  let contacts = 0;
  for (const other of standing) {
    if (other.id === candidate.id || other.team !== candidate.team) continue;
    const clearance = bodyRadius(world, candidate) + bodyRadius(world, other);
    if (distanceBetween(candidate.pos, other.pos) >= clearance) continue;
    contacts += 1;
    if (contacts > 1) return true;
  }
  return false;
}

function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * How much of an overlap each of a pair gives up. Normally in proportion to how
 * light it is against the other, so an assault barely notices a scout and the
 * scout gives way — but a hull that was bolted down gives nothing, and whatever
 * walked into it gives all of it. An emplacement is not an obstacle a lance can
 * shoulder aside, and two of them cannot push each other anywhere at all.
 *
 * This asks whether the frame moves, not `isImmobile`: a mech with both legs
 * gone is going nowhere under its own power, but it is still a hundred tonnes
 * of body with a mass to be shoved about, and treating it as a bollard would
 * quietly change how every fight that legs something plays out.
 */
function separationShares(a: MechEntity, b: MechEntity): [number, number] {
  if (!a.mobile && !b.mobile) return [0, 0];
  if (!a.mobile) return [0, 1];
  if (!b.mobile) return [1, 0];

  const total = a.tonnage + b.tonnage;
  return [b.tonnage / total, a.tonnage / total];
}

/** Moves a mech if the ground there will take it, and leaves it alone if not. */
function nudge(world: World, entity: MechEntity, dx: number, dy: number): boolean {
  if (Math.hypot(dx, dy) <= CONTACT_EPSILON) return false;
  const to: Vec2 = { x: entity.pos.x + dx, y: entity.pos.y + dy };
  if (!passableAt(world, to)) return false;
  entity.pos = to;
  return true;
}
