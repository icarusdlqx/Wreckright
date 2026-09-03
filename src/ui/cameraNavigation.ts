import { useSyncExternalStore } from 'react';
import {
  findEntity,
  isOperational,
  type EntityId,
  type Vec2,
  type World,
} from '../sim/types';

export interface CameraNavigationEngine {
  readonly world: World;
  readonly renderer: { readonly camera: { centreOn: (point: Vec2) => void } };
  selectedEntities: () => EntityId[];
}

/**
 * Screen direction each pan key names. WASD doubles the arrows for a hand
 * that lives on the left of the keyboard; A and S are also orders, so they
 * only pan once held long enough to be a pan rather than a tap.
 */
const PAN_KEYS: Readonly<Record<string, Vec2>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  KeyW: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
};
const ORDER_PAN_KEYS = new Set(['KeyA', 'KeyS']);
export const ORDER_KEY_PAN_HOLD_MS = 220;

/** Pan keys name the view's destination; panBy takes the counter-motion used by dragging. */
export function keyPanDelta(
  held: ReadonlySet<string>,
  distance: number,
  heldLongEnough: (code: string) => boolean = () => true,
): Vec2 {
  let horizontal = 0;
  let vertical = 0;
  for (const code of held) {
    const direction = PAN_KEYS[code];
    if (direction === undefined) continue;
    if (ORDER_PAN_KEYS.has(code) && !heldLongEnough(code)) continue;
    horizontal += direction.x;
    vertical += direction.y;
  }
  horizontal = Math.sign(horizontal);
  vertical = Math.sign(vertical);
  return { x: horizontal === 0 ? 0 : -horizontal * distance, y: vertical * distance };
}

export function arrowPanDelta(held: ReadonlySet<string>, distance: number): Vec2 {
  return keyPanDelta(held, distance);
}

export const EDGE_SCROLL_MARGIN = 28;
export const EDGE_SCROLL_KEY = 'ironline.edgeScroll';

/** Off by default: a pointer drifting to the edge on the way to a panel should not move the map. */
export function readEdgeScroll(): boolean {
  try {
    return globalThis.localStorage?.getItem(EDGE_SCROLL_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeEdgeScroll(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(EDGE_SCROLL_KEY, enabled ? '1' : '0');
  } catch {
    // Private browsing; the preference just does not persist.
  }
}

/** A pointer resting against the edge of the view pans it the way the keys do. */
export function edgePanDelta(
  pointer: Vec2 | null,
  viewport: { width: number; height: number },
  distance: number,
  margin = EDGE_SCROLL_MARGIN,
): Vec2 {
  if (pointer === null) return { x: 0, y: 0 };
  const held = new Set<string>();
  if (pointer.x <= margin) held.add('ArrowLeft');
  else if (pointer.x >= viewport.width - margin) held.add('ArrowRight');
  if (pointer.y <= margin) held.add('ArrowUp');
  else if (pointer.y >= viewport.height - margin) held.add('ArrowDown');
  return keyPanDelta(held, distance);
}

export function selectedCentre(engine: CameraNavigationEngine): Vec2 | null {
  let x = 0;
  let y = 0;
  let count = 0;
  for (const id of engine.selectedEntities()) {
    const entity = findEntity(engine.world, id);
    if (entity === null || !isOperational(entity)) continue;
    x += entity.pos.x;
    y += entity.pos.y;
    count += 1;
  }
  return count === 0 ? null : { x: x / count, y: y / count };
}

export function centreOnSelection(engine: CameraNavigationEngine | null): boolean {
  if (engine === null) return false;
  const centre = selectedCentre(engine);
  if (centre === null) return false;
  engine.renderer.camera.centreOn(centre);
  return true;
}

// Follow-selection lives outside React and outside the engine: the frame
// loop reads it every frame, the keyboard flips it, and the HUD button only
// needs to subscribe. A pan by any hand releases it — a camera that fights
// the player for the view is worse than one that has to be re-asked.
let following = false;
const followListeners = new Set<() => void>();

export function followingSelection(): boolean {
  return following;
}

export function setFollowSelection(on: boolean): void {
  if (following === on) return;
  following = on;
  for (const listener of followListeners) listener();
}

export function toggleFollowSelection(): boolean {
  setFollowSelection(!following);
  return following;
}

export function resetFollowSelection(): void {
  setFollowSelection(false);
}

export function subscribeFollowSelection(listener: () => void): () => void {
  followListeners.add(listener);
  return () => followListeners.delete(listener);
}

export function useFollowSelection(): boolean {
  return useSyncExternalStore(subscribeFollowSelection, followingSelection, () => false);
}

/** One frame of following: keeps the view on the selection while it is on. */
export function followSelection(engine: CameraNavigationEngine | null): boolean {
  if (!following || engine === null) return false;
  return centreOnSelection(engine);
}
