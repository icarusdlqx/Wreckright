import type { MoveOrder } from '../sim/orders';
import type { EntityId, MechEntity, Vec2, World } from '../sim/types';
import { isOperational } from '../sim/types';
import type { ContactSnapshot } from './store';

export interface CommanderViewInput {
  playerTeam: number;
  selection: readonly EntityId[];
  contacts: readonly ContactSnapshot[];
}

export interface CommanderZoneView {
  id: string;
  name: string;
  position: Vec2;
  radius: number;
  owner: number | null;
  contender: number | null;
  progress: number;
  captureSeconds: number;
  contested: boolean;
}

export interface CommanderChitView {
  id: EntityId;
  team: number;
  kind: 'friendly' | 'optical';
  position: Vec2;
  facing: number;
  selected: boolean;
}

export interface CommanderContactView {
  id: EntityId;
  team: number;
  label: string;
  position: Vec2;
  approximateRange: number | null;
  current: boolean;
  source: 'sensor';
}

export interface CommanderRouteLeg {
  points: Vec2[];
  run: boolean;
  engage: boolean;
}

export interface CommanderRouteView {
  entityId: EntityId;
  active: CommanderRouteLeg;
  queued: CommanderRouteLeg[];
}

export interface CommanderViewModel {
  width: number;
  height: number;
  tileSize: number;
  zones: CommanderZoneView[];
  chits: CommanderChitView[];
  contacts: CommanderContactView[];
  routes: CommanderRouteView[];
}

function copyPoint(point: Vec2): Vec2 {
  return { x: point.x, y: point.y };
}

function appendDistinct(points: Vec2[], point: Vec2): void {
  const previous = points[points.length - 1];
  if (previous?.x === point.x && previous.y === point.y) return;
  points.push(copyPoint(point));
}

function routeLeg(points: Vec2[], order: MoveOrder): CommanderRouteLeg {
  return {
    points,
    run: order.run,
    engage: order.engage === true,
  };
}

function routeFor(entity: MechEntity): CommanderRouteView | null {
  const move = entity.orders.move;
  if (move === null) return null;

  const activePoints: Vec2[] = [copyPoint(entity.pos)];
  const pathIndex = Math.max(0, Math.min(entity.path.length, entity.pathIndex));
  for (const point of entity.path.slice(pathIndex)) appendDistinct(activePoints, point);
  appendDistinct(activePoints, move.to);

  const queued: CommanderRouteLeg[] = [];
  let from = activePoints[activePoints.length - 1] ?? entity.pos;
  for (const order of entity.orders.queue) {
    const points = [copyPoint(from), copyPoint(order.to)];
    queued.push(routeLeg(points, order));
    from = order.to;
  }

  return {
    entityId: entity.id,
    active: routeLeg(activePoints, move),
    queued,
  };
}

function exactChits(world: World, input: CommanderViewInput): CommanderChitView[] {
  const selection = new Set(input.selection);
  const optical = world.vision?.team === input.playerTeam ? world.vision.visible : null;
  const chits: CommanderChitView[] = [];

  for (const entity of world.entities) {
    if (!isOperational(entity)) continue;
    const friendly = entity.team === input.playerTeam;
    if (!friendly && optical?.has(entity.id) !== true) continue;
    chits.push({
      id: entity.id,
      team: entity.team,
      kind: friendly ? 'friendly' : 'optical',
      position: copyPoint(entity.pos),
      facing: entity.facing,
      selected: selection.has(entity.id),
    });
  }

  return chits.sort((left, right) => left.id - right.id);
}

export function buildCommanderViewModel(
  world: World,
  input: CommanderViewInput,
): CommanderViewModel {
  const chits = exactChits(world, input);
  const exactIds = new Set(chits.map((chit) => chit.id));
  const selected = new Set(input.selection);

  const routes = world.entities.flatMap((entity) => {
    if (
      entity.team !== input.playerTeam ||
      !selected.has(entity.id) ||
      !isOperational(entity)
    ) return [];
    const route = routeFor(entity);
    return route === null ? [] : [route];
  });

  return {
    width: world.terrain.width * world.terrain.tileSize,
    height: world.terrain.height * world.terrain.tileSize,
    tileSize: world.terrain.tileSize,
    zones: world.zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      position: { x: zone.x, y: zone.y },
      radius: zone.radius,
      owner: zone.owner,
      contender: zone.contender,
      progress: zone.progress,
      captureSeconds: zone.captureSeconds,
      contested: zone.contested,
    })),
    chits,
    contacts: input.contacts
      .filter((contact) => contact.team !== input.playerTeam && !exactIds.has(contact.id))
      .map((contact) => ({
        id: contact.id,
        team: contact.team,
        label: contact.label,
        position: copyPoint(contact.position),
        approximateRange: contact.approximateRange,
        current: contact.current,
        source: contact.source,
      }))
      .sort((left, right) => left.id - right.id),
    routes,
  };
}
