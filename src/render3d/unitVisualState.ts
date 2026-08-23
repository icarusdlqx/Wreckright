import { LOCATIONS } from '../schema/common';
import type { Faction } from '../schema/faction';
import { angleDifference, clamp, normaliseAngle } from '../sim/math';
import type { MechEntity, World } from '../sim/types';
import { damageWearTier } from './damageLedger';
import { machineCulture } from './machineCulture';

export interface VisualPose {
  x: number;
  y: number;
  facing: number;
  torso: number;
}

export interface VisualMotionSample {
  prev: VisualPose;
  cur: VisualPose;
}

export interface TerminalFallAxis {
  /** Rotation around the local forward axis; positive falls toward local left. */
  pitch: number;
  /** Rotation around the local lateral axis; negative falls toward local front. */
  roll: number;
}

export function modelDamageSignature(entity: MechEntity, faction: Faction): number {
  let bits = (entity.destroyed ? 17 : 7) ^ (entity.team + 1);
  const revealsWear = machineCulture(faction).revealsFieldDamage;

  for (let index = 0; index < LOCATIONS.length; index += 1) {
    const location = LOCATIONS[index];
    if (location === undefined) continue;
    const state = entity.locations[location];
    const mark = (revealsWear ? damageWearTier(state) : 0) + (state.destroyed ? 4 : 0);
    if (mark === 0) continue;
    bits = Math.imul(bits ^ ((index + 1) * 11 + mark), 16777619);
  }
  for (let index = 0; index < entity.weapons.length; index += 1) {
    if (entity.weapons[index]?.destroyed === true) bits = Math.imul(bits ^ (index + 17), 16777619);
  }
  return bits >>> 0;
}

export function impactFallAxis(
  target: Pick<VisualPose, 'x' | 'y' | 'facing'>,
  attacker: Pick<VisualPose, 'x' | 'y'>,
): TerminalFallAxis | null {
  const dx = target.x - attacker.x;
  const dy = target.y - attacker.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return null;
  const away = Math.atan2(dy, dx);
  const local = angleDifference(target.facing, away);
  return { pitch: Math.sin(local), roll: -Math.cos(local) };
}

/** Impact data is absent for cook-offs, so the fallback varies around the facing deterministically. */
export function fallbackFallAxis(entityId: number): TerminalFallAxis {
  const quarter = Math.abs(entityId) % 4;
  if (quarter === 0) return { pitch: 0, roll: -1 };
  if (quarter === 1) return { pitch: 1, roll: -0.18 };
  if (quarter === 2) return { pitch: 0, roll: 1 };
  return { pitch: -1, roll: 0.18 };
}

export function writeInterpolatedPose(
  out: VisualPose,
  sample: VisualMotionSample,
  alpha: number,
  faction: Faction,
): void {
  out.x = sample.prev.x + (sample.cur.x - sample.prev.x) * alpha;
  out.y = sample.prev.y + (sample.cur.y - sample.prev.y) * alpha;
  out.facing = normaliseAngle(
    sample.prev.facing + angleDifference(sample.prev.facing, sample.cur.facing) * alpha,
  );
  out.torso = machineCulture(faction).instantTorsoTracking
    ? sample.cur.torso
    : sample.prev.torso + (sample.cur.torso - sample.prev.torso) * alpha;
}

export function sealedTargetOffset(
  world: World,
  entity: MechEntity,
  displayed: VisualPose,
): number {
  if (
    !machineCulture(world.catalog.chassis.get(entity.chassisId)?.faction ?? 'linewrought')
      .instantTorsoTracking ||
    entity.destroyed ||
    entity.shutdownRemaining > 0 ||
    entity.downRemaining > 0 ||
    entity.targetId === null
  ) return entity.torsoOffset;

  let target: MechEntity | null = null;
  for (const candidate of world.entities) {
    if (candidate.id === entity.targetId) {
      target = candidate;
      break;
    }
  }
  if (target === null || target.destroyed || target.withdrawn) return entity.torsoOffset;
  const targetBearing = Math.atan2(target.pos.y - displayed.y, target.pos.x - displayed.x);
  return clamp(
    angleDifference(displayed.facing, targetBearing),
    -entity.twistLimit,
    entity.twistLimit,
  );
}
