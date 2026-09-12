import type { SimEvent } from '../sim/events';
import { findEntity, type World } from '../sim/types';
import type { MechModel } from './modelTypes';
import { canPresentEntity } from './visibilityPresentation';

export interface HitResponse {
  remaining: number;
  duration: number;
  pitch: number;
  roll: number;
  strength: number;
}

export function createHitResponse(): HitResponse {
  return { remaining: 0, duration: 0.4, pitch: 0, roll: 0, strength: 0 };
}

/** A brief body reaction makes contact legible without moving the tactical footprint. */
export function presentHitResponse(world: World, event: Extract<SimEvent, { type: 'projectile_hit' }>,
  model: MechModel | undefined, placed: boolean, reducedMotion: boolean): void {
  if (model === undefined || !placed || reducedMotion || !canPresentEntity(world, event.targetId)) return;
  const target = findEntity(world, event.targetId);
  if (target === null || target.destroyed || target.downRemaining > 0 || target.shutdownRemaining > 0) return;
  const family = world.catalog.weapons.get(event.weaponId)?.type;
  const heft = Math.min(1, Math.max(0, event.damage) / Math.max(12, target.tonnage * 0.45));
  if (heft <= 0) return;
  const response = model.hitResponse;
  // Never derive a bearing from an unseen attacker. The struck part and armour face are known.
  const side = event.location.startsWith('left') ? 1 : event.location.startsWith('right') ? -1 : 0;
  response.pitch = side * 0.7;
  response.roll = event.arc === 'rear' ? -1 : 1;
  response.strength = Math.min(0.12, Math.max(response.strength,
    (0.025 + heft * 0.085) * (family === 'energy' ? 0.45 : family === 'missile' ? 0.7 : 1)));
  response.duration = 0.32 + Math.min(0.16, target.tonnage / 650);
  response.remaining = response.duration;
}

export function advanceHitResponse(response: HitResponse, deltaSeconds: number): void {
  response.remaining = Math.max(0, response.remaining - Math.max(0, deltaSeconds));
  if (response.remaining === 0) response.strength = 0;
}

export function applyHitResponse(model: MechModel): void {
  const response = model.hitResponse;
  if (response.remaining <= 0) return;
  const spent = 1 - response.remaining / response.duration;
  const spring = Math.cos(spent * Math.PI * 1.5) * (1 - spent) ** 2 * response.strength;
  model.torso.rotation.x += response.pitch * spring;
  model.torso.rotation.z += response.roll * spring;
  model.torso.position.y -= model.height * Math.abs(spring) * 0.07;
  for (const arm of model.articulation.arms) arm.pivot.rotation.z -= spring * 0.5;
}
