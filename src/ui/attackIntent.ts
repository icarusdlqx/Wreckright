import { attackApproachRoute, type AttackApproachRoute } from '../sim/attackApproach';
import { isHoldingFire, isRooted } from '../sim/orders';
import { isSightedBy, visionFor } from '../sim/sensors';
import { findEntity, isOperational, type MechEntity, type World } from '../sim/types';

interface CachedIntent { tick: number; key: string; plan: AttackApproachRoute | null }
const plans = new WeakMap<World, Map<number, CachedIntent>>();

/** UI and route markers share one path solve per selected machine and simulation tick. */
export function selectedAttackIntent(world: World, entity: MechEntity): AttackApproachRoute | null {
  if (entity.team !== world.playerTeam || !isOperational(entity) || entity.orders.move !== null ||
    isRooted(entity) || isHoldingFire(entity)) return null;
  const target = findEntity(world, entity.orders.attack?.targetId ?? null);
  if (target === null || !isOperational(target) || !isSightedBy(visionFor(world, entity.team), target)) return null;
  const key = `${target.id}:${entity.groupIntent.join('')}:${entity.posture}`;
  let entries = plans.get(world);
  if (entries === undefined) { entries = new Map(); plans.set(world, entries); }
  const previous = entries.get(entity.id);
  if (previous?.tick === world.tick && previous.key === key) return previous.plan;
  const plan = attackApproachRoute(world, entity, target);
  entries.set(entity.id, { tick: world.tick, key, plan });
  return plan;
}
