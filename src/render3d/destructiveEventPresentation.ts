import type { Vector3 } from 'three';
import type { MechLocation } from '../schema/common';
import type { SimEvent } from '../sim/events';
import { findEntity, type Vec2, type World } from '../sim/types';
import type { TracerLayer } from './tracers';
import type { BattlefieldWear } from './battlefieldWear';

export type DestructiveEvent = Extract<SimEvent, { type: 'mech_destroyed' | 'ammo_explosion' }>;

export function destructiveLocation(event: DestructiveEvent): MechLocation {
  return event.type === 'ammo_explosion' ? event.location : event.method === 'head' ? 'head' : 'centre_torso';
}

/** A stopped cockpit leaves a recoverable hull. Reactor and ammunition breaches burn. */
export function presentDestructiveEvent(world: World, event: DestructiveEvent,
  at: Vec2, point: Vector3, ground: number, tracers: TracerLayer, wear: BattlefieldWear): number {
  const water = world.terrain.idAtPoint(at) === 'water';
  if (event.type === 'ammo_explosion') {
    tracers.burst(at, point.y - 14, 'ammo', 0xffa34f,
      0.8 + Math.min(1, event.damage / 60), 'generic', 0, ground);
    tracers.spawnSmoke(at, point.y - 14);
    wear.ammo(at, event.damage, water);
    return 6;
  }
  const scale = 1 + Math.min(1.2, (findEntity(world, event.entityId)?.tonnage ?? 50) / 100);
  if (event.method === 'head') {
    tracers.burst(at, point.y - 14, 'critical', 0xc8ecdb, scale * 0.55, 'generic', 0, ground);
    tracers.ventSteam(point);
    return 1.4;
  }
  tracers.burst(at, point.y - 14, 'terminal', 0xff6b38, scale, 'generic', 0, ground);
  wear.wreck(event.entityId, at, point.y - 6, water);
  return 6;
}
