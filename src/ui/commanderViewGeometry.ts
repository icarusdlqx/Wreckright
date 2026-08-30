import type { Vec2 } from '../sim/types';

export interface CommanderMapRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function commanderPointFromClient(
  client: Vec2,
  bounds: CommanderMapRect,
  map: { width: number; height: number },
): Vec2 {
  const scale = Math.min(bounds.width / map.width, bounds.height / map.height);
  if (!Number.isFinite(scale) || scale <= 0) return { x: 0, y: 0 };
  const drawnWidth = map.width * scale;
  const drawnHeight = map.height * scale;
  const left = bounds.left + (bounds.width - drawnWidth) / 2;
  const top = bounds.top + (bounds.height - drawnHeight) / 2;
  return {
    x: Math.max(0, Math.min(map.width, (client.x - left) / scale)),
    y: Math.max(0, Math.min(map.height, (client.y - top) / scale)),
  };
}

export function commanderPoints(points: readonly Vec2[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

export function supportLanePoints(
  at: Vec2,
  to: Vec2,
  length: number,
  width: number,
): string {
  const drag = Math.hypot(to.x - at.x, to.y - at.y);
  const heading = drag > 0 ? Math.atan2(to.y - at.y, to.x - at.x) : 0;
  const along = { x: Math.cos(heading) * (length / 2), y: Math.sin(heading) * (length / 2) };
  const across = { x: -Math.sin(heading) * (width / 2), y: Math.cos(heading) * (width / 2) };
  return commanderPoints([
    { x: at.x - along.x - across.x, y: at.y - along.y - across.y },
    { x: at.x + along.x - across.x, y: at.y + along.y - across.y },
    { x: at.x + along.x + across.x, y: at.y + along.y + across.y },
    { x: at.x - along.x + across.x, y: at.y - along.y + across.y },
  ]);
}
