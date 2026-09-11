import type { RouteMarkerLeg, RouteMarkerView } from '../render3d/routeMarkerTypes';
import { findEntity, isOperational, type EntityId, type MechEntity, type Vec2, type World } from '../sim/types';
import { selectedAttackIntent } from './attackIntent';

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
    else {
      const approach = selectedAttackIntent(world, entity);
      if (approach?.needsMove && approach.reachable) {
        const points = [copyPoint(entity.pos), ...approach.path.map(copyPoint)];
        routes.push({ entityId: entity.id, team: entity.team, legs: [{
          points, kind: 'active', run: false,
          arrivalFacing: arrivalFacing(points, entity.facing), arrivalFacingEstimated: true,
          cumulativeEtaSeconds: cumulativeEta(0, points, entity.walkSpeed),
        }] });
      }
    }
  }
  return routes;
}
