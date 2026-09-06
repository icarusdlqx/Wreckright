import type { Viewport } from '../render3d/camera';
import type { Vec2 } from '../sim/types';
import type { Engine } from './engine';

interface ScreenRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Keep the instruction open while putting its destination in reachable field space. */
export function trainingGateAnchor(viewport: Viewport, coach: ScreenRect | null, top: number): Vec2 {
  const centre = { x: viewport.width / 2, y: viewport.height / 2 };
  if (coach === null || centre.x < coach.left - 24 || centre.x > coach.right + 24
    || centre.y < coach.top - 24 || centre.y > coach.bottom + 24) return centre;
  const clearTop = Math.max(0, top) + 24;
  const clearBottom = coach.top - 24;
  return { x: centre.x, y: Math.max(clearTop, (clearTop + clearBottom) / 2) };
}

export function showTrainingGate(engine: Engine | null): void {
  const gate = engine?.world.zones.find((zone) => zone.id === 'range_gate');
  if (engine === null || gate === undefined) return;
  const { camera, viewport, canvas } = engine.renderer;
  camera.skipDropIn();
  camera.centreOn(gate);

  const app = canvas.closest('.app');
  const coach = app?.querySelector('.mobile-training')?.getBoundingClientRect();
  if (coach === undefined) return;
  const bounds = canvas.getBoundingClientRect();
  const topbar = app?.querySelector('.topbar')?.getBoundingClientRect();
  const anchor = trainingGateAnchor(viewport, {
    left: coach.left - bounds.left,
    right: coach.right - bounds.left,
    top: coach.top - bounds.top,
    bottom: coach.bottom - bounds.top,
  }, (topbar?.bottom ?? bounds.top) - bounds.top + 44);
  const from = camera.worldToScreen(gate, viewport);
  camera.zoomBetween(1, from, anchor, viewport);
}
