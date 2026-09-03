import type { AmmoBin, EntityId, MechEntity, World } from './types';

export function isOperational(entity: MechEntity): boolean {
  return (
    !entity.destroyed &&
    !entity.disabled &&
    !entity.withdrawn &&
    !entity.pilot.dead &&
    !entity.pilot.ejected
  );
}

/** Both legs shot away. An emplacement never had any, so it is never this. */
export function isLegged(entity: MechEntity): boolean {
  return entity.mobile && entity.locations.left_leg.destroyed && entity.locations.right_leg.destroyed;
}

/**
 * Going nowhere, for either of the two reasons there are. An emplacement was
 * bolted down to begin with; a mech with both legs gone has arrived at the same
 * place by a worse route. Everything downstream — jets, pathing, pace, being
 * shoved aside — asks this one question rather than each asking its own.
 */
export function isImmobile(entity: MechEntity): boolean {
  return !entity.mobile || isLegged(entity);
}

/** On the ground: cannot move, turn, twist or shoot, and easy to hit. */
export function isDown(entity: MechEntity): boolean {
  return entity.downRemaining > 0;
}

/** Rocking, but still upright. The next big hit is the one that floors it. */
export function isStaggered(entity: MechEntity, staggerThreshold: number): boolean {
  return !isDown(entity) && entity.stability >= staggerThreshold;
}

export function legPenaltyFactor(entity: MechEntity, singleLegFactor: number): number {
  if (isImmobile(entity)) return 0;
  const lost = entity.locations.left_leg.destroyed || entity.locations.right_leg.destroyed;
  if (!lost) return 1;
  // Reinforced actuators claw back part of the loss, never more than all of it.
  return Math.min(1, singleLegFactor * entity.legLossFactor);
}

export function findEntity(world: World, id: EntityId | null): MechEntity | null {
  if (id === null) return null;
  return world.entities.find((entity) => entity.id === id) ?? null;
}

export function findAmmoBin(entity: MechEntity, weaponId: string): AmmoBin | null {
  return (
    entity.ammoBins.find(
      (bin) => bin.weaponId === weaponId && !bin.destroyed && bin.rounds > 0,
    ) ?? null
  );
}
