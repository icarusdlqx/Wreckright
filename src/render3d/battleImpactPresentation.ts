import type { Vector3 } from 'three';
import type { MechLocation } from '../schema/common';
import type { SimEvent } from '../sim/events';
import { findEntity, type EntityId, type Vec2, type World } from '../sim/types';
import {
  missCueAngle,
  missCueDistance,
  presentedFlightSeconds,
  weaponEventColour,
} from './battleEventPresentation';
import type { BattlefieldWear } from './battlefieldWear';
import type { EjectionPodPool } from './ejectionPodPool';
import { burstFamilyOf } from './shotBurstProfiles';
import type { TracerLayer } from './tracers';
import { canPresentEntity } from './visibilityPresentation';

type HitEvent = Extract<SimEvent, { type: 'projectile_hit' }>;
type MissEvent = Extract<SimEvent, { type: 'projectile_miss' }>;
type GroundImpactEvent = Extract<SimEvent, { type: 'ground_impact' }>;
type EjectionEvent = Extract<SimEvent, { type: 'pilot_ejected' }>;

const SHELL_COLOUR = 0xffb267;
const POD_COLOUR = 0xffd9a0;

/** What an impact needs from the effects owner without seeing its whole surface. */
export interface ImpactHost {
  readonly tracers: TracerLayer;
  readonly wear: BattlefieldWear;
  readonly pods: EjectionPodPool;
  readonly lowFx: boolean;
  readonly effectPoint: Vector3;
  readonly effectAt: Vec2;
  heightAt(x: number, y: number): number;
  positionOf(id: EntityId): Vec2 | null;
  currentPositionOf(id: EntityId): Vec2 | null;
  locationOf(id: EntityId, location: MechLocation, out: Vector3): boolean;
  toGroundPoint(at: Vector3): void;
  nearness(at: Vec2): number;
  addShake(magnitude: number): void;
  light(at: Vector3, colour: number, strength: number): void;
}

export function presentProjectileHit(host: ImpactHost, world: World, event: HitEvent): void {
  if (!canPresentEntity(world, event.targetId)) return;
  const weapon = world.catalog.weapons.get(event.weaponId);
  const colour = weaponEventColour(weapon);
  if (!host.locationOf(event.targetId, event.location, host.effectPoint)) return;
  host.tracers.resolveProjectile(event, host.effectPoint);
  host.toGroundPoint(host.effectPoint);
  const delay = presentedFlightSeconds(
    weapon, host.positionOf(event.shooterId), host.positionOf(event.targetId),
  );
  host.tracers.burst(
    host.effectAt,
    host.effectPoint.y - 14,
    'hit',
    colour,
    0.75 + Math.min(1.25, event.damage / 18),
    burstFamilyOf(weapon?.visual.style),
    delay,
  );
  const damage = weapon?.damage ?? 5;
  host.wear.scars.mark(
    host.effectAt,
    host.heightAt(host.effectAt.x, host.effectAt.y),
    3 + Math.min(9, damage * 0.35),
    weapon?.type === 'energy' ? 1 : 0.25,
  );
  if (event.damage >= 14) host.addShake(1.6 * host.nearness(host.effectAt));
}

export function presentProjectileMiss(host: ImpactHost, world: World, event: MissEvent): void {
  if (!canPresentEntity(world, event.targetId)) return;
  const target = host.currentPositionOf(event.targetId);
  if (target === null) return;
  const angle = missCueAngle(event);
  const distance = missCueDistance(event);
  host.effectAt.x = target.x + Math.cos(angle) * distance;
  host.effectAt.y = target.y + Math.sin(angle) * distance;
  const weapon = world.catalog.weapons.get(event.weaponId);
  const ground = host.heightAt(host.effectAt.x, host.effectAt.y);
  host.effectPoint.set(host.effectAt.x, ground, host.effectAt.y);
  host.tracers.resolveProjectile(event, host.effectPoint, true);
  host.tracers.burst(
    host.effectAt,
    ground - 14,
    'miss',
    weaponEventColour(weapon),
    0.8,
    burstFamilyOf(weapon?.visual.style),
    presentedFlightSeconds(weapon, host.positionOf(event.shooterId), target),
  );
}

/** A shell arriving is a column of earth, a smoke pall and a thump through the camera. */
export function presentGroundImpact(host: ImpactHost, event: GroundImpactEvent): void {
  const ground = host.heightAt(event.x, event.y);
  host.effectAt.x = event.x;
  host.effectAt.y = event.y;
  host.tracers.burst(host.effectAt, ground - 14, 'shell', SHELL_COLOUR, 1.6, 'generic');
  host.tracers.spawnSmoke(host.effectAt, ground - 6, 0.6);
  host.addShake(4.5 * host.nearness(host.effectAt));
  if (host.lowFx) return;
  host.effectPoint.set(event.x, ground + 8, event.y);
  host.light(host.effectPoint, SHELL_COLOUR, 24);
}

export function presentEjection(host: ImpactHost, world: World, event: EjectionEvent): void {
  if (!canPresentEntity(world, event.entityId)) return;
  if (!host.locationOf(event.entityId, 'head', host.effectPoint)) return;
  const entity = findEntity(world, event.entityId);
  host.pods.launch(host.effectPoint, event.entityId * 47 + event.tick, 0.6 + (entity?.tonnage ?? 50) / 120);
  host.toGroundPoint(host.effectPoint);
  host.tracers.burst(host.effectAt, host.effectPoint.y - 14, 'critical', POD_COLOUR, 0.7, 'generic');
}
