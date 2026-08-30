import type { Viewport } from '../render3d/camera';
import { isOperational, type Vec2, type World } from '../sim/types';
import { snapshotContacts } from './snapshot';

export interface MinimapBlip {
  id: number;
  team: number;
  position: Vec2;
  kind: 'friendly' | 'optical' | 'sensor' | 'memory';
}

export interface MinimapMapSize {
  width: number;
  height: number;
}

export interface MinimapRect extends MinimapMapSize {
  left: number;
  top: number;
}

export interface MinimapZoneView {
  id: string;
  position: Vec2;
  radius: number;
  owner: number | null;
}

export interface MinimapContactPulse {
  id: number;
  position: Vec2;
  startedAt: number;
}

export interface MinimapPulseLedger {
  seeded: boolean;
  seen: Set<number>;
  pulses: MinimapContactPulse[];
}

export interface MinimapPulseAppearance {
  radius: number;
  alpha: number;
}

export const MINIMAP_PULSE_MILLISECONDS = 1_400;

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function clamp(value: number, maximum: number): number {
  return Math.max(0, Math.min(maximum, value));
}

/** Sensor blips carry the track's quantized point, never the entity's live position. */
export function minimapBlips(world: World): MinimapBlip[] {
  const playerTeam = world.playerTeam ?? 0;
  const blips: MinimapBlip[] = [];
  for (const entity of world.entities) {
    if (!isOperational(entity)) continue;
    const mine = entity.team === playerTeam;
    if (!mine && world.vision?.visible.has(entity.id) !== true) continue;
    blips.push({
      id: entity.id,
      team: entity.team,
      position: { x: entity.pos.x, y: entity.pos.y },
      kind: mine ? 'friendly' : 'optical',
    });
  }
  for (const contact of snapshotContacts(world, playerTeam)) {
    blips.push({
      id: contact.id,
      team: contact.team,
      position: { x: contact.position.x, y: contact.position.y },
      kind: contact.current ? 'sensor' : 'memory',
    });
  }
  return blips;
}

/** Only ownership crosses the minimap seam; capture progress can reveal hidden occupiers. */
export function minimapZones(world: World): MinimapZoneView[] {
  return world.zones.map((zone) => ({
    id: zone.id,
    position: { x: zone.x, y: zone.y },
    radius: zone.radius,
    owner: zone.owner,
  }));
}

export function minimapPointFromClient(
  client: Vec2,
  bounds: MinimapRect,
  map: MinimapMapSize,
): Vec2 | null {
  if (
    !finitePositive(bounds.width) ||
    !finitePositive(bounds.height) ||
    !finitePositive(map.width) ||
    !finitePositive(map.height)
  ) return null;
  return {
    x: clamp(((client.x - bounds.left) / bounds.width) * map.width, map.width),
    y: clamp(((client.y - bounds.top) / bounds.height) * map.height, map.height),
  };
}

export function minimapKeyboardTarget(
  target: Vec2,
  key: string,
  tileSize: number,
  map: MinimapMapSize,
): Vec2 | null {
  const step = tileSize * 2;
  if (!finitePositive(step) || !finitePositive(map.width) || !finitePositive(map.height)) {
    return null;
  }
  let offset: Vec2;
  switch (key) {
    case 'ArrowLeft':
      offset = { x: -step, y: 0 };
      break;
    case 'ArrowRight':
      offset = { x: step, y: 0 };
      break;
    case 'ArrowUp':
      offset = { x: 0, y: -step };
      break;
    case 'ArrowDown':
      offset = { x: 0, y: step };
      break;
    default:
      return null;
  }
  return {
    x: clamp(target.x + offset.x, map.width),
    y: clamp(target.y + offset.y, map.height),
  };
}

function canvasPoint(point: Vec2, map: MinimapMapSize, canvas: MinimapMapSize): Vec2 {
  return {
    x: clamp((point.x / map.width) * canvas.width, canvas.width),
    y: clamp((point.y / map.height) * canvas.height, canvas.height),
  };
}

export function minimapViewportFootprint(
  project: (screen: Vec2, viewport: Viewport) => Vec2,
  viewport: Viewport,
  map: MinimapMapSize,
  canvas: MinimapMapSize,
): Vec2[] {
  if (
    !finitePositive(viewport.width) ||
    !finitePositive(viewport.height) ||
    !finitePositive(map.width) ||
    !finitePositive(map.height) ||
    !finitePositive(canvas.width) ||
    !finitePositive(canvas.height)
  ) return [];
  const corners = [
    { x: 0, y: 0 },
    { x: viewport.width, y: 0 },
    { x: viewport.width, y: viewport.height },
    { x: 0, y: viewport.height },
  ];
  const footprint = corners.map((corner) => project(corner, viewport));
  if (footprint.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return [];
  }
  return footprint.map((point) => canvasPoint(point, map, canvas));
}

export function createMinimapPulseLedger(): MinimapPulseLedger {
  return { seeded: false, seen: new Set(), pulses: [] };
}

export function updateMinimapContactPulses(
  ledger: MinimapPulseLedger,
  blips: readonly MinimapBlip[],
  now: number,
): void {
  ledger.pulses = ledger.pulses.filter(
    (pulse) => now - pulse.startedAt < MINIMAP_PULSE_MILLISECONDS,
  );
  const contacts = blips.filter((blip) => blip.kind !== 'friendly');
  if (!ledger.seeded) {
    for (const contact of contacts) ledger.seen.add(contact.id);
    ledger.seeded = true;
    return;
  }
  for (const contact of contacts) {
    if (ledger.seen.has(contact.id)) continue;
    ledger.seen.add(contact.id);
    if (contact.kind === 'memory') continue;
    ledger.pulses.push({
      id: contact.id,
      position: { x: contact.position.x, y: contact.position.y },
      startedAt: now,
    });
  }
}

export function minimapPulseAppearance(
  pulse: MinimapContactPulse,
  now: number,
  reducedMotion: boolean,
): MinimapPulseAppearance | null {
  const elapsed = now - pulse.startedAt;
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= MINIMAP_PULSE_MILLISECONDS) {
    return null;
  }
  if (reducedMotion) return { radius: 9, alpha: 0.82 };
  const progress = elapsed / MINIMAP_PULSE_MILLISECONDS;
  return { radius: 5 + progress * 12, alpha: 0.9 * (1 - progress) };
}
