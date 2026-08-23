import type { MechLocation } from '../schema/common';
import { bodyRadius } from './collision';
import { emit } from './events';
import { applyHeatGovernor } from './governor';
import { distance } from './math';
import { beginJump } from './movement';
import {
  applyPlayerTargeting,
  approachToEngage,
  approachToLastKnown,
  engageWorthTarget,
  orderedContact,
} from './orderTargeting';
import { replacePath } from './pathProgress';
import { findPath } from './pathfind';
import { isSightedBy, visionFor } from './sensors';
import {
  findEntity,
  isImmobile,
  isDown,
  isOperational,
  type EntityId,
  type MechEntity,
  type Posture,
  type Vec2,
  type World,
} from './types';

export interface MoveOrder {
  to: Vec2;
  run: boolean;
  /** Attack-move: stop and fight whatever shows itself, then carry on. */
  engage?: boolean;
}

export interface AttackOrder {
  targetId: EntityId;
  calledShot: MechLocation | null;
}

export interface OrderState {
  move: MoveOrder | null;
  attack: AttackOrder | null;
  /** Legs of a queued route, walked in order as each move completes. */
  queue: MoveOrder[];
}

export function emptyOrders(): OrderState {
  return { move: null, attack: null, queue: [] };
}

/** True while the stance has the mech rooted to the ground it is standing on. */
export function isRooted(entity: MechEntity): boolean {
  return entity.posture === 'hold_position' || entity.posture === 'return_fire';
}

export function setPosture(entity: MechEntity, posture: Posture): void {
  entity.posture = posture;
  if (!isRooted(entity)) return;

  // Told to hold this ground: whatever it was walking towards is cancelled.
  entity.orders.move = null;
  replacePath(entity, []);
  entity.motion = 'stationary';
  entity.intendedMotion = 'stationary';
}

export function issueMove(
  world: World,
  entity: MechEntity,
  to: Vec2,
  run: boolean,
  options: { engage?: boolean; queued?: boolean } = {},
): boolean {
  if (!isOperational(entity) || isImmobile(entity)) return false;

  // Shift held: this leg joins the route instead of replacing it.
  if (options.queued === true && entity.orders.move !== null) {
    entity.orders.queue.push({
      to: { x: to.x, y: to.y },
      run,
      ...(options.engage === true ? { engage: true } : {}),
    });
    return true;
  }

  const path = findPath(world.terrain, entity.pos, to, world.rules.simulation.pathfindMaxNodes);
  if (path === null) return false;

  // A move order is the pilot being told to go somewhere, which overrides an
  // order to stand still. Keep-facing survives — moving is the point of it.
  if (isRooted(entity)) entity.posture = 'free';

  entity.orders.move = {
    to: reachableDestination(world, path, to),
    run,
    ...(options.engage === true ? { engage: true } : {}),
  };
  entity.stallStrikes = 0;
  // A plain move order is "disengage and go": it releases the standing
  // attack order, or the mech marches to the spot and then wanders back to
  // chase its old target. The guns still pick opportunistic targets on the
  // way; attack-move keeps the engagement, since fighting through is its
  // entire point.
  if (options.engage !== true) entity.orders.attack = null;
  entity.orders.queue = options.queued === true ? entity.orders.queue : [];
  replacePath(entity, path);
  // A new order starts with a clean record of how it is going. Carrying the
  // last one's counters over meant a mech that had been wedged took a stall
  // strike on the very first tick of its fresh order — the closest it had
  // ever been to the OLD waypoint is not a bar the new one can clear — and
  // the route was wiped before the player ever saw the line.
  entity.nextPathTick = world.tick + world.rules.simulation.aiPathIntervalTicks;
  entity.motion = run ? 'run' : 'walk';
  entity.intendedMotion = entity.motion;
  return true;
}

export function issueAttack(
  world: World,
  entity: MechEntity,
  targetId: EntityId,
  calledShot: MechLocation | null,
): boolean {
  if (!isOperational(entity)) return false;
  const target = findEntity(world, targetId);
  if (
    target === null ||
    target.team === entity.team ||
    !isSightedBy(visionFor(world, entity.team), target) ||
    !isOperational(target)
  ) {
    return false;
  }
  entity.orders.attack = { targetId, calledShot };
  entity.targetId = targetId;
  entity.calledShot = calledShot;
  return true;
}

/** Fires the jets toward a point, clamped to the reach the mech actually has. */
export function issueJump(world: World, entity: MechEntity, to: Vec2): boolean {
  return beginJump(world, entity, to);
}

/** Whether the jets are aboard, charged and free to fire right now. */
export function canJump(entity: MechEntity): boolean {
  return (
    entity.jumpRange > 0 &&
    entity.jump === null &&
    entity.jumpCooldown <= 0 &&
    isOperational(entity) &&
    entity.shutdownRemaining <= 0 &&
    !isDown(entity) &&
    !isImmobile(entity)
  );
}

/**
 * Everything at once, and damn the reactor.
 *
 * The heat capacity gate normally stops a mech firing a volley it cannot
 * afford, which is sensible and completely invisible — the player never sees
 * the alpha they did not throw. This is that decision handed over: one button,
 * a couple of seconds where every gun that will bear fires, and a real chance
 * of standing there cooking while the enemy walks around you.
 */
export function issueAlphaStrike(world: World, entity: MechEntity): boolean {
  if (!isOperational(entity) || entity.shutdownRemaining > 0 || isDown(entity)) return false;
  if (world.tick < entity.alphaReadyAtTick) return false;

  const rules = world.rules.heat;
  entity.alphaUntilTick = world.tick + Math.round(rules.alphaStrikeSeconds / world.dt);
  entity.alphaReadyAtTick = world.tick + Math.round(rules.alphaStrikeCooldownSeconds / world.dt);
  // The guns come back on for it: an alpha the pilot has to un-hold first is
  // an alpha they will fumble.
  for (let group = 0; group < entity.groupIntent.length; group += 1) {
    entity.groupIntent[group] = true;
    entity.groupEnabled[group] = true;
  }
  emit(world.events, { type: 'alpha_strike', tick: world.tick, entityId: entity.id });
  return true;
}

export function issueStop(entity: MechEntity): void {
  entity.orders.move = null;
  replacePath(entity, []);
  entity.stallStrikes = 0;
  entity.motion = 'stationary';
  entity.intendedMotion = entity.motion;
}

/**
 * Where an order can actually end. When the path stops short of the ask — the
 * click was on water, a cliff, the far side of a wall — the order is retargeted
 * to the ground the route reaches. Left pointed at the unreachable spot, the
 * arrival check can never pass, and the mech spends the rest of the battle
 * walking into the bank, stalling, and re-solving the same route.
 */
function reachableDestination(world: World, path: readonly Vec2[], asked: Vec2): Vec2 {
  const last = path[path.length - 1];
  if (last === undefined || distance(last, asked) <= world.rules.movement.arrivalRadius) {
    return { x: asked.x, y: asked.y };
  }
  return { x: last.x, y: last.y };
}

/** How many stalled re-solves mean the route is hopeless and the order drops. */
const HOPELESS_STRIKES = 3;

/**
 * Whether another machine is parked on the destination, close enough that the
 * walker cannot take the spot, and the walker is already up against it. This
 * is the honest test for "the ground I was sent to is taken".
 */
function standingOnDestination(world: World, entity: MechEntity, to: Vec2): boolean {
  const reach = bodyRadius(world, entity);
  for (const other of world.entities) {
    if (other.id === entity.id || !isOperational(other) || other.jump !== null) continue;
    const clearance = reach + bodyRadius(world, other);
    if (distance(other.pos, to) > clearance) continue;
    // Something is on the spot; the order is done when the walker is up
    // against that machine rather than still crossing the map towards it.
    if (distance(entity.pos, other.pos) <= clearance + world.rules.movement.arrivalRadius) {
      return true;
    }
  }
  return false;
}

/** An order from the pilot: sets intent, and takes effect immediately. */
export function setGroupEnabled(entity: MechEntity, group: number, enabled: boolean): void {
  if (group < 1 || group > entity.groupIntent.length) return;
  entity.groupIntent[group - 1] = enabled;
  entity.groupEnabled[group - 1] = enabled;
}

export function setHoldFire(entity: MechEntity, holdFire: boolean): void {
  for (let group = 0; group < entity.groupIntent.length; group += 1) {
    entity.groupIntent[group] = !holdFire;
    entity.groupEnabled[group] = !holdFire;
  }
}

/** Reported from intent: a governor throttle is not the pilot holding fire. */
export function isHoldingFire(entity: MechEntity): boolean {
  return entity.groupIntent.every((enabled) => !enabled);
}

export function updatePlayerControl(world: World, entity: MechEntity): void {
  const immobile = isImmobile(entity);
  if (immobile) {
    // Losing both legs ends every route immediately, even while shutdown or
    // down. Keep the attack and weapon intent: when it can act again this is
    // an emplacement, not a wreck.
    entity.orders.move = null;
    entity.orders.queue.length = 0;
    replacePath(entity, []);
  }

  if (!isOperational(entity) || entity.shutdownRemaining > 0 || isDown(entity)) {
    entity.motion = 'stationary';
    entity.intendedMotion = entity.motion;
    return;
  }

  const contact = orderedContact(world, entity);
  if (contact.gone) entity.orders.attack = null;

  // Airborne: the arc is committed. Keep picking visible targets, leave the feet alone.
  if (entity.jump !== null) {
    applyPlayerTargeting(world, entity, contact, isHoldingFire(entity));
    return;
  }

  // A mech left to its own devices should not cook itself into a shutdown while
  // the player is looking somewhere else. Overridable, but on by default.
  if (entity.heatSafety) applyHeatGovernor(world, entity, false);

  const order = immobile || isRooted(entity) ? null : entity.orders.move;
  if (immobile) {
    entity.motion = 'stationary';
    entity.intendedMotion = entity.motion;
  } else if (order === null) {
    // No march on the books — but an attack order on something out of reach
    // is still an order to go and fight it. A target set and then stood
    // around for reads as a control that does nothing: the panel says
    // "no sight" on every gun and the mech never moves to change that.
    const approaching =
      !isRooted(entity) &&
      contact.target !== null &&
      approachToEngage(world, entity, contact.target);
    const investigating =
      !isRooted(entity) &&
      contact.target === null &&
      entity.orders.attack !== null &&
      contact.lastKnown !== null &&
      approachToLastKnown(world, entity, contact.lastKnown);
    if (!approaching && !investigating) {
      replacePath(entity, []);
      entity.motion = 'stationary';
      entity.intendedMotion = entity.motion;
    }
  } else if (
    order.engage === true &&
    !isHoldingFire(entity) &&
    engageWorthTarget(world, entity) !== null
  ) {
    // Attack-move, and something has shown itself: stand and fight. The move
    // order is kept — the advance resumes on its own once the field is clear.
    replacePath(entity, []);
    entity.motion = 'stationary';
    entity.intendedMotion = entity.motion;
  } else if (
    distance(entity.pos, order.to) <= world.rules.movement.arrivalRadius ||
    // Stalled out with the destination itself under another machine: the last
    // stretch is a body, not ground. That is as arrived as this order is ever
    // going to get — looping walk-shove-stall against a lance-mate for the
    // rest of the battle is what "my mech is stuck" means. It has to be the
    // spot that is occupied, not merely somewhere near it: measuring from the
    // walker's own bulk made this discard orders to open ground up to forty
    // metres off, which is an order the player watched vanish.
    standingOnDestination(world, entity, order.to)
  ) {
    const next = entity.orders.queue.shift();
    if (next === undefined) {
      issueStop(entity);
    } else {
      issueMove(world, entity, next.to, next.run, {
        ...(next.engage === true ? { engage: true } : {}),
      });
    }
  } else if (entity.stallStrikes >= HOPELESS_STRIKES) {
    // Re-solved the route this many times and stalled out every time — the
    // way is shut. Standing down beats headbutting the blockage forever, but
    // it is said out loud: an order that evaporates in silence is the hardest
    // thing to tell apart from a control that does not work.
    issueStop(entity);
    if (!entity.autopilot) {
      emit(world.events, {
        type: 'mission_message',
        tick: world.tick,
        text: `${entity.name} cannot find a way through — order dropped.`,
      });
    }
  } else {
    if (entity.path.length === 0 || world.tick >= entity.nextPathTick) {
      const path = findPath(
        world.terrain,
        entity.pos,
        order.to,
        world.rules.simulation.pathfindMaxNodes,
      );
      entity.nextPathTick = world.tick + world.rules.simulation.aiPathIntervalTicks;

      if (path === null) {
        // Genuinely unreachable: drop the order rather than shuffle forever,
        // and say so — a route that quietly ceases to exist mid-walk looks
        // from the outside exactly like the game forgetting the order.
        replacePath(entity, []);
        entity.orders.move = null;
        if (!entity.autopilot) {
          emit(world.events, {
            type: 'mission_message',
            tick: world.tick,
            text: `${entity.name} has no route to that point.`,
          });
        }
      } else if (path.length === 0) {
        // Already inside the destination tile but not yet on the spot. A tile is
        // four times the arrival radius across, so this is most short orders —
        // walk the last few metres instead of cancelling.
        replacePath(entity, [{ x: order.to.x, y: order.to.y }]);
      } else {
        replacePath(entity, path);
        // The re-solve can also come up short of the ask; anchor the order to
        // what the route actually reaches, or arrival never fires.
        order.to = reachableDestination(world, path, order.to);
      }
    }
    entity.motion = entity.path.length === 0 ? 'stationary' : order.run ? 'run' : 'walk';
    entity.intendedMotion = entity.motion;
  }

  applyPlayerTargeting(world, entity, contact, isHoldingFire(entity));
}
