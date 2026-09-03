import { KILLING_BLOW_SECONDS } from '../render3d/camera';
import { machineCulture } from '../render3d/machineCulture';
import type { RouteMarkerLeg, RouteMarkerView } from '../render3d/routeMarkerTypes';
import type { Renderer } from '../render3d/scene';
import { canPresentEntity } from '../render3d/visibilityPresentation';
import type { SimEvent } from '../sim/events';
import { hitPreview } from '../sim/preview';
import { isSightedBy } from '../sim/sensors';
import {
  findEntity,
  isOperational,
  type EntityId,
  type MechEntity,
  type Vec2,
  type World,
} from '../sim/types';
import { stepWorld } from '../sim/world';
import type { AudioDirector } from './audio';
import { authoredDesignName } from './designLabel';
import { eventLogLine } from './eventLogPresentation';
import type { IncomingFireDirections } from './incomingFireDirections';
import { crossedMissionClockWarnings } from './missionClock';
import type { OrderFeedback } from './orderFeedback';
import { stoppedCount } from './objectiveReadout';
import { snapshotUnits } from './snapshot';
import { useGame, type HitPreviewView } from './store';

const MAX_QUEUED_ROUTE_MARKERS = 8;

function copyPoint(point: Vec2): Vec2 {
  return { x: point.x, y: point.y };
}

function appendDistinct(points: Vec2[], point: Vec2): void {
  const previous = points[points.length - 1];
  if (previous?.x === point.x && previous.y === point.y) return;
  points.push(copyPoint(point));
}

function arrivalFacing(points: readonly Vec2[], fallback: number): number {
  for (let index = points.length - 1; index > 0; index -= 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from === undefined || to === undefined) continue;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx !== 0 || dy !== 0) return Math.atan2(dy, dx);
  }
  return fallback;
}

function polylineDistance(points: readonly Vec2[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from === undefined || to === undefined) continue;
    total += Math.hypot(to.x - from.x, to.y - from.y);
  }
  return total;
}

function cumulativeEta(
  previous: number | null,
  points: readonly Vec2[],
  speed: number,
): number | null {
  if (previous === null || !Number.isFinite(speed) || speed <= 0) return null;
  const legDistance = polylineDistance(points);
  if (!Number.isFinite(legDistance)) return null;
  return previous + legDistance / speed;
}

function routeFor(entity: MechEntity): RouteMarkerView | null {
  const move = entity.orders.move;
  if (move === null) return null;

  const activePoints: Vec2[] = [copyPoint(entity.pos)];
  const pathIndex = Math.max(0, Math.min(entity.path.length, entity.pathIndex));
  for (const point of entity.path.slice(pathIndex)) appendDistinct(activePoints, point);
  appendDistinct(activePoints, move.to);

  let facing = arrivalFacing(activePoints, entity.facing);
  let eta = cumulativeEta(0, activePoints, move.run ? entity.runSpeed : entity.walkSpeed);
  const legs: RouteMarkerLeg[] = [
    {
      points: activePoints,
      kind: 'active',
      run: move.run,
      arrivalFacing: facing,
      arrivalFacingEstimated: true,
      cumulativeEtaSeconds: eta,
    },
  ];

  let from = activePoints[activePoints.length - 1] ?? entity.pos;
  const queuedCount = Math.min(entity.orders.queue.length, MAX_QUEUED_ROUTE_MARKERS);
  for (let index = 0; index < queuedCount; index += 1) {
    const order = entity.orders.queue[index];
    if (order === undefined) continue;
    const points = [copyPoint(from), copyPoint(order.to)];
    facing = arrivalFacing(points, facing);
    eta = cumulativeEta(eta, points, order.run ? entity.runSpeed : entity.walkSpeed);
    legs.push({
      points,
      kind: 'queued',
      run: order.run,
      arrivalFacing: facing,
      arrivalFacingEstimated: true,
      cumulativeEtaSeconds: eta,
    });
    from = order.to;
  }

  return { entityId: entity.id, team: entity.team, legs };
}

/**
 * Selected route intent, crossing the same friendly-only privacy boundary as
 * the rest of the presentation layer. Hostile order state is never inspected.
 */
export function buildFriendlyRouteMarkers(
  world: World,
  selection: ReadonlySet<EntityId>,
): readonly RouteMarkerView[] {
  const playerTeam = world.playerTeam;
  if (playerTeam === null) return [];

  const routes: RouteMarkerView[] = [];
  for (const id of selection) {
    const entity = findEntity(world, id);
    if (entity === null || entity.team !== playerTeam || !isOperational(entity)) continue;
    const route = routeFor(entity);
    if (route !== null) routes.push(route);
  }
  return routes;
}

/** Owns the HUD-facing view of a battle, including its contact privacy boundary. */
export class EnginePresentation {
  private clockSeconds: number;
  private outcomeDelaySeconds = 0;
  /** Every optical or electronic contact acquired, for the new-contact brake. */
  private readonly sighted = new Set<EntityId>();
  private contactsSeeded = false;

  constructor(
    private readonly world: World,
    private readonly renderer: Renderer,
    private readonly audio: AudioDirector,
    private readonly maxTicks: number,
    private readonly incomingFire: IncomingFireDirections | null = null,
    private readonly orderFeedback: OrderFeedback | null = null,
  ) {
    this.clockSeconds = maxTicks * world.dt;
  }

  forceStep(): void {
    if (this.world.finished) return;
    const before = this.clockSeconds;
    stepWorld(this.world, this.maxTicks);
    this.clockSeconds = Math.max(0, (this.maxTicks - this.world.tick) * this.world.dt);
    this.renderer.snapshot(this.world);
    const events = this.world.events.splice(0, this.world.events.length);
    this.renderer.consumeEvents(this.world, events);
    this.beginKillingBlow(events);
    this.incomingFire?.consume(this.world, events, useGame.getState().selection);
    this.orderFeedback?.consume(this.world, events);
    this.audio.listenAt = this.renderer.camera.target;
    this.audio.consume(
      this.world,
      events,
      useGame.getState().speed,
      this.renderer.camera.reducedMotion,
    );
    this.logEvents(events);
    if (!this.world.finished) {
      for (const warning of crossedMissionClockWarnings(before, this.clockSeconds)) {
        useGame.getState().pushLog(warning);
      }
    }
  }

  /** Advances the results hold on wall time, independent of battle speed. */
  advance(deltaSeconds: number): boolean {
    if (this.outcomeDelaySeconds <= 0) return false;
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    this.outcomeDelaySeconds = Math.max(0, this.outcomeDelaySeconds - delta);
    return this.outcomeDelaySeconds === 0;
  }

  routeMarkers(selection: ReadonlySet<EntityId>): readonly RouteMarkerView[] {
    return buildFriendlyRouteMarkers(this.world, selection);
  }

  emitDamageSmoke(): void {
    for (const entity of this.world.entities) {
      if (!isOperational(entity) || !canPresentEntity(this.world, entity.id)) continue;

      // A mech running hot says so on the battlefield, not just in a panel:
      // steam off the vents is how a player reads "that one is about to shut
      // down" while looking at the fight rather than at a bar.
      if (entity.heat > entity.heatCapacity * 0.62) {
        const vent = this.renderer.positionOf(entity.id);
        if (vent !== null) this.renderer.spawnSmoke(vent);
      }

      const faction = this.world.catalog.chassis.get(entity.chassisId)?.faction ?? 'linewrought';
      if (!machineCulture(faction).revealsFieldDamage) continue;

      // Front and back together, so a mech stripped from behind smokes too.
      const damaged = Object.values(entity.locations).some(
        (location) =>
          location.destroyed ||
          location.armour + location.rearArmour <
            (location.armourMax + location.rearArmourMax) * 0.35,
      );
      if (!damaged) continue;
      const at = this.renderer.positionOf(entity.id);
      if (at !== null) this.renderer.spawnSmoke(at);
    }
  }

  publish(hoveredId: EntityId | null): void {
    const playerTeam = this.world.playerTeam ?? 0;
    const { units, enemies, contacts } = snapshotUnits(this.world, playerTeam);
    const state = useGame.getState();
    const finished = this.world.finished && this.outcomeDelaySeconds === 0;
    const outcomePending = this.world.finished && !finished;

    this.brakeOnNewContact([...enemies, ...contacts]);

    const selection = state.selection.filter((id) => {
      const entity = findEntity(this.world, id);
      return entity !== null && isOperational(entity);
    });

    state.patch({
      tick: this.world.tick,
      elapsedSeconds: this.world.tick * this.world.dt,
      finished,
      winner: finished ? this.world.winner : null,
      outcomePending,
      units,
      enemies,
      contacts,
      playerTeam,
      resourcePoints: Math.floor(this.world.resources.get(playerTeam) ?? 0),
      reservesLeft: this.world.reserves.length,
      missionStatus: this.world.missionStatus,
      missionReason: this.world.missionReason,
      objectives: this.world.objectives.map((objective) => ({
        id: objective.id,
        label: objective.label,
        required: objective.required,
        status: objective.status,
        progress: objective.progress,
        sustained: objective.type === 'protect_zones' || objective.type === 'survive',
        stopped: stoppedCount(this.world, objective),
      })),
      zones: this.world.zones.map((zone) => ({
        id: zone.id,
        name: zone.name,
        owner: zone.owner,
        contender: zone.contender,
        progress: zone.progress,
        captureSeconds: zone.captureSeconds,
        contested: zone.contested,
      })),
      hitPreview: this.previewFor(selection, hoveredId),
      ...(selection.length === state.selection.length ? {} : { selection }),
    });
  }

  private beginKillingBlow(events: readonly SimEvent[]): void {
    const battleEnd = events.find((event) => event.type === 'battle_ended');
    const playerTeam = this.world.playerTeam;
    if (battleEnd === undefined || playerTeam === null || battleEnd.winner !== playerTeam) return;

    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event?.type !== 'mech_destroyed' || event.tick !== battleEnd.tick) continue;
      const wreck = findEntity(this.world, event.entityId);
      if (
        wreck === null ||
        wreck.team === playerTeam ||
        !wreck.destroyed ||
        !canPresentEntity(this.world, wreck.id)
      ) continue;
      if (this.world.entities.some((entity) => entity.team === wreck.team && isOperational(entity))) {
        continue;
      }

      this.renderer.camera.beginKillingBlow(wreck.pos, KILLING_BLOW_SECONDS);
      this.outcomeDelaySeconds = KILLING_BLOW_SECONDS;
      useGame.getState().patch({ outcomePending: true });
      return;
    }
  }

  private logEvents(events: readonly SimEvent[]): void {
    const push = useGame.getState().pushLog;
    for (const event of events) {
      const line = eventLogLine(this.world, event);
      if (line !== null) push(line);
    }
  }

  /**
   * Drops fast-forward the moment a hostile nobody has seen before appears.
   * Contacts blink in and out of cover all battle, so re-acquiring an old
   * contact is not news — only a machine this lance has never detected
   * pulls the clock back to 1×. Whatever was already visible at the drop is
   * seeded silently: the opening of a mirror match is not a surprise.
   */
  private brakeOnNewContact(enemies: readonly { id: EntityId }[]): void {
    if (!this.contactsSeeded) {
      this.contactsSeeded = true;
      for (const enemy of enemies) this.sighted.add(enemy.id);
      return;
    }
    let fresh = false;
    for (const enemy of enemies) {
      if (this.sighted.has(enemy.id)) continue;
      this.sighted.add(enemy.id);
      fresh = true;
    }
    const state = useGame.getState();
    if (fresh && state.speed > 1) {
      state.patch({ speed: 1 });
      state.pushLog('New contact — speed back to 1×.');
    }
  }

  /** The to-hit readout: primary selection priced against cursor or target. */
  private previewFor(
    selection: readonly EntityId[],
    hoveredId: EntityId | null,
  ): HitPreviewView | null {
    const shooterId = selection.find(
      (id) => findEntity(this.world, id)?.team === (this.world.playerTeam ?? 0),
    );
    const shooter = shooterId === undefined ? null : findEntity(this.world, shooterId);
    if (shooter === null || !isOperational(shooter)) return null;

    const hoveredEntity = hoveredId === null ? null : findEntity(this.world, hoveredId);
    const hovered =
      hoveredEntity !== null && hoveredEntity.team !== shooter.team && isOperational(hoveredEntity)
        ? hoveredEntity
        : null;
    const target = hovered ?? findEntity(this.world, shooter.targetId);
    if (
      target === null ||
      target.team === shooter.team ||
      !isOperational(target) ||
      !isSightedBy(this.world.vision, target)
    ) return null;

    const preview = hitPreview(this.world, shooter, target);
    if (preview === null) return null;

    return {
      shooterId: shooter.id,
      targetId: target.id,
      targetName: authoredDesignName(this.world.catalog, {
        id: target.designId,
        name: target.name,
      }),
      range: preview.range,
      hover: hovered !== null,
      weapons: preview.weapons.map((weapon) => ({
        index: weapon.index,
        chance: weapon.chance,
        blocked: weapon.blocked,
      })),
      factors: preview.factors,
    };
  }
}
