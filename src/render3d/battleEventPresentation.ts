import type { Weapon } from '../schema/weapon';
import type { SimEvent } from '../sim/events';
import { Vector3 } from 'three';
import { findEntity, type Vec2, type World } from '../sim/types';
import { canPresentEntity } from './visibilityPresentation';

type Fired = Extract<SimEvent, { type: 'weapon_fired' }>;
const INCOMING_CUE_DISTANCE = 54;

interface TargetCueEvent {
  tick: number;
  targetId: number;
  weaponId: string;
}

/** Target-side variation must never carry the identity of an unseen shooter. */
function targetCueHash(event: TargetCueEvent): number {
  let hash = Math.imul(event.tick + 1, 73_856_093) ^ Math.imul(event.targetId + 1, 83_492_791);
  for (const char of event.weaponId) hash = Math.imul(hash ^ char.charCodeAt(0), 16_777_619);
  return hash >>> 0;
}

export function weaponEventColour(weapon: Weapon | undefined): number {
  return weapon === undefined ? 0xffffff : parseInt(weapon.visual.colour.slice(1), 16);
}

export function missCueAngle(event: Extract<SimEvent, { type: 'projectile_miss' }>): number {
  return targetCueBearing(event);
}

/** Impact variation may use target-side facts, never an unseen firing position. */
export function targetCueBearing(event: TargetCueEvent): number {
  return targetCueHash(event) / 0xffffffff * Math.PI * 2;
}

export function missCueDistance(event: Extract<SimEvent, { type: 'projectile_miss' }>): number {
  return 18 + ((targetCueHash(event) >>> 12) & 15);
}

/** A complete trajectory is safe only when both ends are optically accounted for. */
export function canPresentWeaponFlight(world: World, event: Fired): boolean {
  return canPresentEntity(world, event.shooterId) && canPresentEntity(world, event.targetId);
}

export function canPresentIncomingCue(world: World, event: Fired): boolean {
  return !canPresentEntity(world, event.shooterId) && canPresentEntity(world, event.targetId);
}

/** A short target-side segment whose bearing is independent of the hidden shooter. */
export function incomingCueOrigin(
  event: Fired,
  target: Vec2,
  heightAt: (x: number, y: number) => number,
  out: Vector3,
): Vector3 {
  const angle = targetCueHash(event) / 0xffffffff * Math.PI * 2;
  const x = target.x + Math.cos(angle) * INCOMING_CUE_DISTANCE;
  const y = target.y + Math.sin(angle) * INCOMING_CUE_DISTANCE;
  return out.set(x, heightAt(x, y) + 14, y);
}

export function incomingCueFlightSeconds(weapon: Weapon | undefined): number | null {
  if (weapon?.velocity === null || weapon === undefined) return null;
  return INCOMING_CUE_DISTANCE / weapon.velocity;
}

export function projectileFlightSeconds(
  world: World,
  event: Fired,
  weapon: Weapon | undefined,
): number | null {
  if (weapon?.velocity === null || weapon === undefined) return null;
  const shooter = findEntity(world, event.shooterId);
  const target = findEntity(world, event.targetId);
  if (shooter === null || target === null) return null;
  const range = Math.hypot(target.pos.x - shooter.pos.x, target.pos.y - shooter.pos.y);
  return Math.max(world.dt, Math.ceil(range / weapon.velocity / world.dt) * world.dt);
}
