import type { DifficultyTier } from '../../schema/rules';
import { coverFactorAt, lineOfSight } from '../los';
import { angleDifference, bearing, distance } from '../math';
import { nearestPassable } from '../pathfind';
import { isSightedBy, visionFor } from '../sensors';
import { isOperational, type MechEntity, type Stance, type Vec2, type World } from '../types';
import { hasUsableLineOfFire, usableWeapon, weaponHasLineOfFire } from '../weaponEngagement';
import { weaponMaximumReach } from '../weaponRange';
import { lanceFrontage, roleOf } from './roles';
import { availableDps, engagementRange, exchangeRatio, healthFraction } from './utility';

const DEGREES_TO_RADIANS = Math.PI / 180;

export type { Stance };

export function stanceFor(
  world: World,
  mech: MechEntity,
  target: MechEntity,
  withdrawing: boolean,
  current: Stance | null = null,
): Stance {
  if (withdrawing) return 'withdraw';

  const rules = world.rules.ai.positioning;
  const range = distance(mech.pos, target.pos);
  const preferred = engagementRange(world, mech, target);

  // Enter a manoeuvre at the edge of the tolerance band, but do not leave it
  // until crossing the preferred range itself. This dead band stops a moving
  // target making the same pilot alternate close/hold every decision.
  if (current === 'close' && range > preferred) return 'close';
  if (current === 'back_off' && range < preferred) return 'back_off';

  if (range > preferred + rules.rangeTolerance) return 'close';
  if (range >= preferred - rules.rangeTolerance) return 'hold';

  // Inside the preferred bracket. Giving ground costs seconds of fire, and against
  // something that can match your stride it never opens the range at all — so only
  // back off when the exchange at arm's length is clearly better than this one.
  if (target.runSpeed >= mech.runSpeed) return 'hold';

  const here = exchangeRatio(world, mech, target, range);
  const there = exchangeRatio(world, mech, target, preferred);
  return there > here * rules.backOffAdvantage ? 'back_off' : 'hold';
}

interface Candidate {
  point: Vec2;
  score: number;
}

function passableAt(world: World, point: Vec2): boolean {
  const tile = world.terrain.toTile(point);
  return world.terrain.passable(tile.column, tile.row);
}

/** True when someone other than this mech already has the target's attention. */
function targetIsEngagedElsewhere(mech: MechEntity, target: MechEntity): boolean {
  return target.targetId !== null && target.targetId !== mech.id;
}

function scorePoint(
  world: World,
  mech: MechEntity,
  target: MechEntity,
  point: Vec2,
  stance: Stance,
  tier: DifficultyTier,
  preferred: number,
  /** Multiplies the gunnery term: standing still is worth real accuracy. */
  gunneryFactor: number,
  /** Where this mech wants to sit relative to the rest of the lance. */
  station: { standoff: number; frontage: number } | null,
): number {
  const rules = world.rules.ai.positioning;
  const range = distance(point, target.pos);
  let score = 0;

  if (stance === 'withdraw') {
    const escape = world.rules.ai.withdrawal;
    score += range * escape.openRangeWeight;
    score += coverFactorAt(world.terrain, point) < 1 ? rules.coverWeight : 0;
    if (lineOfSight(world.terrain, point, target.pos).clear) score -= escape.concealmentBonus;
    return score;
  }

  // How much the guns do from there. Out beyond weapon reach every candidate
  // scores zero, so closing distance carries the gradient.
  score += availableDps(world, mech, target, range, point) * gunneryFactor * rules.dpsWeight;
  score -= Math.abs(range - preferred) * rules.rangeErrorWeight;
  if (stance === 'close') score -= range * rules.closingWeight;
  if (stance === 'back_off') score += range * rules.closingWeight;

  if (tier.coverSeeking) {
    score += (1 - coverFactorAt(world.terrain, point)) * rules.coverWeight;
    const tileRef = world.terrain.toTile(point);
    score += world.terrain.elevationAt(tileRef.column, tileRef.row) * rules.elevationWeight;
  }

  if (!hasUsableLineOfFire(world, mech, target, 'intent', point)) score -= rules.losPenalty;

  // A missile carrier belongs behind the hull that can take the return fire, and
  // a brawler belongs in front of it. Distance from the lance's leading edge is
  // what actually expresses that.
  if (station !== null) {
    const wanted = station.frontage + station.standoff;
    score -= Math.abs(range - wanted) * rules.stationWeight;
  }

  if (tier.flanking && targetIsEngagedElsewhere(mech, target)) {
    const fromTarget = bearing(target.pos, point);
    const offNose = Math.abs(angleDifference(target.facing, fromTarget));
    if (offNose > rules.flankAngleDegrees * DEGREES_TO_RADIANS) score += rules.flankWeight;
  }

  for (const mate of world.entities) {
    if (mate.id === mech.id || mate.team !== mech.team || !isOperational(mate)) continue;
    if (distance(point, mate.pos) < rules.spacingRadius) score -= rules.spacingWeight;
  }

  return score;
}

/**
 * Samples a ring of positions and picks the one that best serves the stance —
 * cover, elevation, the range bracket the guns want, and staying off the
 * target's nose when a lancemate already has its attention.
 *
 * Standing still competes as a candidate in its own right, and it competes with
 * the accuracy bonus a stationary shooter actually gets. Without that the ring
 * always contains somewhere marginally better than here, and a lance spends the
 * battle shuffling between neighbouring tiles instead of shooting.
 *
 * Returns null to mean "stay where you are".
 */
export function choosePosition(
  world: World,
  mech: MechEntity,
  target: MechEntity,
  stance: Stance,
  tier: DifficultyTier,
  /** Ground the mech has been told to stand on; candidates outside it are dropped. */
  bounds: { x: number; y: number; radius: number } | null = null,
): Vec2 | null {
  const rules = world.rules.ai.positioning;
  const preferred = engagementRange(world, mech, target);
  const step = rules.repositionStep;
  const motion = world.rules.combat.shooterMotion;
  const profile = roleOf(world, mech);
  const station =
    stance === 'withdraw'
      ? null
      : { standoff: profile.standoff, frontage: lanceFrontage(world, mech, target) };

  const candidates: Candidate[] = [];

  for (let index = 0; index < rules.candidateDirections; index += 1) {
    const angle = (index / rules.candidateDirections) * Math.PI * 2;
    const raw: Vec2 = {
      x: mech.pos.x + Math.cos(angle) * step,
      y: mech.pos.y + Math.sin(angle) * step,
    };

    const tile = world.terrain.toTile(raw);
    const snapped = nearestPassable(world.terrain, tile.column, tile.row, 2);
    if (snapped === null) continue;

    const point = world.terrain.tileCentre(snapped.column, snapped.row);
    if (!passableAt(world, point)) continue;
    if (bounds !== null && distance(point, bounds) > bounds.radius * 0.75) continue;

    candidates.push({
      point,
      score: scorePoint(world, mech, target, point, stance, tier, preferred, motion.walk, station),
    });
  }

  const staying = scorePoint(
    world,
    mech,
    target,
    mech.pos,
    stance,
    tier,
    preferred,
    motion.stationary,
    station,
  );

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (best === undefined || best.score <= staying) return null;
  if (distance(best.point, mech.pos) < step * 0.5) return null;
  return best.point;
}

/** How many enemy guns currently bear on a spot. Crossing open ground is what kills lances. */
export function exposureAt(world: World, mech: MechEntity, point: Vec2): number {
  let seen = 0;
  const vision = visionFor(world, mech.team);
  for (const enemy of world.entities) {
    if (enemy.team === mech.team) continue;
    if (!isSightedBy(vision, enemy)) continue;
    if (!isOperational(enemy)) continue;
    const range = distance(point, enemy.pos);
    const covered = enemy.weapons.some((mount) => {
      const weapon = usableWeapon(world, enemy, mount, 'intent');
      return (
        weapon !== null &&
        range <= weaponMaximumReach(world, weapon, enemy.pos, point) &&
        weaponHasLineOfFire(world, enemy.pos, point, weapon)
      );
    });
    if (covered) seen += 1;
  }
  return seen;
}

/**
 * A march that is not a beeline. Still closes, but inside an arc rather than
 * along one line, preferring cover and high ground, avoiding ground already
 * covered by enemy guns, and keeping off the lancemates' toes so the lance
 * arrives on a front instead of in a heap.
 */
export function approachPoint(
  world: World,
  mech: MechEntity,
  target: MechEntity,
  tier: DifficultyTier,
): Vec2 {
  const rules = world.rules.ai.positioning;
  const toTarget = bearing(mech.pos, target.pos);
  const gap = distance(mech.pos, target.pos);
  const stride = Math.min(rules.repositionStep * 2, Math.max(rules.repositionStep, gap * 0.6));
  const arc = rules.approachArcDegrees * DEGREES_TO_RADIANS;
  const directions = rules.candidateDirections;

  let best: Vec2 | null = null;
  let bestScore = -Infinity;

  for (let index = 0; index < directions; index += 1) {
    const offset = directions === 1 ? 0 : -arc + (2 * arc * index) / (directions - 1);
    const angle = toTarget + offset;
    const raw: Vec2 = {
      x: mech.pos.x + Math.cos(angle) * stride,
      y: mech.pos.y + Math.sin(angle) * stride,
    };

    const tile = world.terrain.toTile(raw);
    const snapped = nearestPassable(world.terrain, tile.column, tile.row, 2);
    if (snapped === null) continue;
    const point = world.terrain.tileCentre(snapped.column, snapped.row);

    // Closing the distance is the point of the manoeuvre; everything else shapes it.
    let score = (gap - distance(point, target.pos)) * rules.approachProgressWeight;

    if (tier.coverSeeking) {
      score += (1 - coverFactorAt(world.terrain, point)) * rules.coverWeight;
      score += world.terrain.elevationAt(snapped.column, snapped.row) * rules.elevationWeight;
      score -= exposureAt(world, mech, point) * rules.approachExposureWeight;
    }

    for (const mate of world.entities) {
      if (mate.id === mech.id || mate.team !== mech.team || !isOperational(mate)) continue;
      if (distance(point, mate.pos) < rules.spacingRadius) score -= rules.spacingWeight;
      if (mate.ai.destination !== null && distance(point, mate.ai.destination) < rules.spacingRadius) {
        score -= rules.spacingWeight;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = point;
    }
  }

  return best ?? { x: target.pos.x, y: target.pos.y };
}

/** What a side still brings to the fight: how many mechs, weighted by how whole they are. */
function teamStrength(world: World, team: number, observerTeam: number): number {
  let total = 0;
  const vision = visionFor(world, observerTeam);
  for (const entity of world.entities) {
    if (entity.team !== team) continue;
    if (team !== observerTeam && !isSightedBy(vision, entity)) continue;
    if (!isOperational(entity)) continue;
    total += healthFraction(entity);
  }
  return total;
}

/** True when nothing still fighting could catch this mech if it ran. */
function canOutrunPursuit(world: World, mech: MechEntity): boolean {
  let pursuers = 0;
  const vision = visionFor(world, mech.team);
  for (const enemy of world.entities) {
    if (enemy.team === mech.team) continue;
    if (!isSightedBy(vision, enemy)) continue;
    if (!isOperational(enemy)) continue;
    pursuers += 1;
    if (enemy.runSpeed >= mech.runSpeed) return false;
  }
  return pursuers > 0;
}

/**
 * Being hurt is not a reason to leave — losing is. A crippled mech in a lance
 * that is still winning falls back behind its friends and keeps shooting; it
 * only quits the field once its side no longer has the strength to finish.
 *
 * The exception is the scout. A mech nothing on the field can catch has an exit
 * available that a heavy does not, and spending it is free: it costs the lance
 * a body it was about to lose anyway.
 */
export function shouldWithdraw(
  world: World,
  mech: MechEntity,
  currentlyWithdrawing: boolean,
  structure: number,
): boolean {
  const rules = world.rules.ai.withdrawal;
  // Late in the clock the bar for staying drops. Early on, a hurt machine on a
  // slightly weaker side is right to keep fighting — the battle can still turn.
  // With the clock mostly burned it cannot: the same machine shuffling to a
  // timeout draw serves nobody, so it concedes the field while it still can.
  const clockFraction =
    (world.tick * world.dt) / world.mission.maxDurationSeconds;
  const endgame = clockFraction >= rules.endgameClockFraction;

  const threshold = currentlyWithdrawing
    ? rules.resumeStructureFraction
    : endgame
      ? Math.max(rules.structureFraction, rules.endgameStructureFraction)
      : rules.structureFraction;
  if (structure >= threshold) return false;

  if (canOutrunPursuit(world, mech)) return true;

  const mine = teamStrength(world, mech.team, mech.team);
  let theirs = 0;
  for (const team of new Set(world.entities.map((entity) => entity.team))) {
    if (team !== mech.team) theirs += teamStrength(world, team, mech.team);
  }

  const ratio = endgame
    ? Math.max(rules.losingStrengthRatio, rules.endgameStrengthRatio)
    : rules.losingStrengthRatio;
  return mine < theirs * ratio;
}

export function withdrawalPoint(world: World, mech: MechEntity): Vec2 {
  const vision = visionFor(world, mech.team);
  const enemies = world.entities.filter(
    (entity) =>
      entity.team !== mech.team &&
      isSightedBy(vision, entity) &&
      isOperational(entity),
  );
  if (enemies.length === 0) return { x: mech.pos.x, y: mech.pos.y };

  let awayX = 0;
  let awayY = 0;
  for (const enemy of enemies) {
    awayX += mech.pos.x - enemy.pos.x;
    awayY += mech.pos.y - enemy.pos.y;
  }

  const length = Math.hypot(awayX, awayY) || 1;
  const reach = world.rules.ai.positioning.repositionStep * 3;

  const extent = {
    x: world.terrain.width * world.terrain.tileSize,
    y: world.terrain.height * world.terrain.tileSize,
  };

  return {
    x: Math.max(10, Math.min(extent.x - 10, mech.pos.x + (awayX / length) * reach)),
    y: Math.max(10, Math.min(extent.y - 10, mech.pos.y + (awayY / length) * reach)),
  };
}
