import type { Vec2 } from '../sim/types';
import type { VoicePlacement } from './audioGraph';

/** Camera bearing determines left/right; distance retains the original audible radius. */
export function fieldPlacement(
  at: Vec2,
  listener: Vec2,
  azimuth = -Math.PI / 2,
  cameraDistance = 470,
  scale = 1,
): VoicePlacement {
  const dx = at.x - listener.x;
  const dy = at.y - listener.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance)) return { level: 0, distance: 0, pan: 0 };
  const bearing = Number.isFinite(azimuth) ? azimuth : -Math.PI / 2;
  const spread = Math.max(80, Number.isFinite(cameraDistance) ? cameraDistance * 0.55 : 260);
  const right = dx * Math.sin(bearing) - dy * Math.cos(bearing);
  return {
    level: Math.max(0, 1 - distance / 900) ** 1.4 * scale,
    distance,
    pan: Math.max(-0.8, Math.min(0.8, right / spread)),
  };
}
