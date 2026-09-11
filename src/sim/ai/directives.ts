import type { EnemyDirective } from '../../schema/mission';
import type { DifficultyTier } from '../../schema/rules';
import { applyHeatGovernor } from '../governor';
import { distance } from '../math';
import { findPath } from '../pathfind';
import { replacePath } from '../pathProgress';
import { isDown, isImmobile, isOperational, type EntityId, type MechEntity, type Vec2, type World } from '../types';
import { zoneById, type ZoneState } from '../zones';
import { chooseCalledShot } from './aim';
import { selectFireModesForRange } from './fireModes';
import { contestedZoneSweepPoint } from './mission';
import { choosePosition, shouldWithdraw, stanceFor } from './positioning';
import { holdingForRepair } from './support';
import { canStillFight, coreFraction, scoreTargets, structureFraction } from './utility';

export interface MissionDuty {
  directive: EnemyDirective;
  zone: ZoneState;
}

/** Authored ordering is priority; a surviving defender keeps its station. */
export function assignDirectives(world: World, team: number): Map<EntityId, MissionDuty> {
  const assignments = new Map<EntityId, MissionDuty>();
  const directives = world.mission.enemyDirectives.filter((directive) => directive.team === team);
  if (directives.length === 0) return assignments;
  const available = world.entities.filter((mech) => mech.team === team &&
    mech.controller === 'tactical' && isOperational(mech) && !isImmobile(mech) && !mech.ai.withdrawing);
  for (const directive of directives) {
    const zone = zoneById(world, directive.zoneId);
    if (zone === null) continue;
    const candidates = available.filter((mech) => !assignments.has(mech.id)).sort((a, b) =>
      Number(b.ai.directiveId === directive.id) - Number(a.ai.directiveId === directive.id) ||
      distance(a.pos, zone) - distance(b.pos, zone) || a.id - b.id);
    for (const mech of candidates.slice(0, directive.units)) {
      mech.ai.directiveId = directive.id;
      assignments.set(mech.id, { directive, zone });
    }
  }
  for (const mech of available) {
    if (!assignments.has(mech.id)) delete mech.ai.directiveId;
  }
  return assignments;
}

function halt(mech: MechEntity): void {
  replacePath(mech, []);
  mech.motion = 'stationary';
  mech.intendedMotion = 'stationary';
  mech.ai.destination = null;
}

function committed(world: World, mech: MechEntity): boolean {
  return mech.ai.destination !== null && mech.path.length > 0 &&
    world.tick < mech.ai.commitUntilTick &&
    distance(mech.pos, mech.ai.destination) > world.rules.movement.arrivalRadius;
}

function moveTo(world: World, mech: MechEntity, point: Vec2): void {
  if (committed(world, mech) && mech.ai.destination !== null &&
    distance(mech.ai.destination, point) <= world.rules.movement.arrivalRadius) return;
  const path = findPath(world.terrain, mech.pos, point, world.rules.simulation.pathfindMaxNodes);
  replacePath(mech, path ?? []);
  mech.ai.destination = path === null ? null : { ...point };
  mech.ai.commitUntilTick = world.tick + Math.round(world.rules.ai.positioning.commitSeconds / world.dt);
  mech.nextPathTick = world.tick + world.rules.simulation.aiPathIntervalTicks;
  mech.motion = mech.path.length > 0 ? 'run' : 'stationary';
  mech.intendedMotion = mech.motion;
}

/** Returns false only when ordinary damage/withdrawal behavior must take precedence. */
export function decideDirective(
  world: World, mech: MechEntity, duty: MissionDuty, focusTargetId: EntityId | null,
  tier: DifficultyTier,
): boolean {
  if (!isOperational(mech) || mech.shutdownRemaining > 0 || isDown(mech)) {
    halt(mech);
    return true;
  }
  const structure = Math.min(structureFraction(mech), coreFraction(mech));
  if (!canStillFight(world, mech) || shouldWithdraw(world, mech, mech.ai.withdrawing, structure)) return false;

  const { directive, zone } = duty;
  const stationRadius = zone.radius * world.rules.ai.directives.stationRadiusFraction;
  const onStation = distance(mech.pos, zone) <= stationRadius;
  // Target scoring is optical-only. A missing target's actual position never
  // decides whether the patrol pursues it or returns to the public objective.
  const chosen = scoreTargets(world, mech, { focusTargetId, currentTargetId: mech.targetId })
    .find(({ target }) => distance(target.pos, zone) <= directive.pursuitRadius);
  mech.ai.withdrawing = false;
  mech.ai.focusTargetId = focusTargetId;
  mech.targetId = chosen?.target.id ?? null;
  mech.calledShot = null;
  if (chosen !== undefined) {
    selectFireModesForRange(world, mech, chosen.range);
    chooseCalledShot(world, mech, chosen.target, tier);
  }
  applyHeatGovernor(world, mech, chosen !== undefined &&
    structureFraction(chosen.target) <= world.rules.ai.heat.finisherOverrideFraction);
  if (holdingForRepair(world, mech)) { halt(mech); return true; }

  const retaking = directive.behavior === 'retake' && (zone.owner !== mech.team || zone.contested);
  const guarding = directive.behavior !== 'intercept' || chosen === undefined || retaking;
  if ((guarding && !onStation) || distance(mech.pos, zone) > directive.pursuitRadius) {
    mech.ai.stance = 'close';
    moveTo(world, mech, { x: zone.x, y: zone.y });
    return true;
  }
  if (onStation && zone.contested && (retaking || chosen === undefined)) {
    if (!committed(world, mech)) {
      moveTo(world, mech, contestedZoneSweepPoint(world, zone, mech.ai.destination, mech.id));
    }
    return true;
  }
  if (chosen === undefined) { mech.ai.stance = 'hold'; halt(mech); return true; }

  const radius = guarding ? stationRadius : directive.pursuitRadius;
  if (committed(world, mech) && mech.ai.destination !== null &&
    distance(mech.ai.destination, zone) <= radius) return true;
  mech.ai.stance = stanceFor(world, mech, chosen.target, false, mech.ai.stance);
  const destination = choosePosition(world, mech, chosen.target, mech.ai.stance, tier,
    { x: zone.x, y: zone.y, radius, radiusFactor: 1 });
  if (destination === null) halt(mech);
  else moveTo(world, mech, destination);
  return true;
}
