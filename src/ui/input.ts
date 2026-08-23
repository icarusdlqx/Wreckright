import type { MechEntity, Vec2 } from '../sim/types';
import { isOperational } from '../sim/types';
import { arrowPanDelta } from './cameraNavigation';
import type { Engine } from './engine';
import { attachBattleKeyboard } from './inputKeyboard';
import { createPointerGestureState, createPointerHandlers } from './inputPointer';
import { useGame } from './store';
import { TouchInput } from './touchInput';

/** How far off a mech, in screen pixels, a click still counts as hitting it. */
const PICK_RADIUS = 34;
const PAN_SPEED = 620;

export function attachInput(engine: Engine, canvas: HTMLCanvasElement): () => void {
  const viewport = (): { width: number; height: number } => engine.renderer.viewport;
  const battleFinished = (): boolean => engine.world.finished || useGame.getState().finished;
  const canAct = (): boolean => useGame.getState().briefingSeen && !battleFinished();
  const pointerState = createPointerGestureState();
  let lastHoverTick = -1;
  let lastCameraKey = '';
  let lastCursorStyle = '';

  /** Selects the friendly hulls touched by the box drawn in screen space. */
  const selectWithin = (a: Vec2, b: Vec2, add: boolean): void => {
    const state = useGame.getState();
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);

    const inside = engine.world.entities
      .filter((entity) => entity.team === state.playerTeam && isOperational(entity))
      .filter((entity) => {
        const body = engine.renderer.screenBodyOf(entity);
        return (
          body.x + body.radius >= minX &&
          body.x - body.radius <= maxX &&
          body.y + body.radius >= minY &&
          body.y - body.radius <= maxY
        );
      })
      .map((entity) => entity.id);

    if (inside.length === 0 && !add) {
      state.setSelection([]);
      return;
    }
    state.setSelection(add ? [...new Set([...state.selection, ...inside])] : inside);
  };

  // Terrain gets the ray first, so clicking a ridge means the ridge rather
  // than the flat ground behind it after the camera has been rotated.
  const screenWorld = (screen: Vec2): Vec2 =>
    engine.renderer.camera.screenToWorld(screen, viewport(), engine.renderer.groundMesh);

  /** Hostiles win pick ties so a friendly cannot shield the intended target. */
  const pickAt = (screen: Vec2): MechEntity | null => {
    const state = useGame.getState();
    const hostile = engine.renderer.entityAtScreen(
      engine.world,
      screen,
      PICK_RADIUS,
      (entity) => entity.team !== state.playerTeam && isOperational(entity),
    );
    if (hostile !== null) return hostile;
    return engine.renderer.entityAtScreen(engine.world, screen, PICK_RADIUS);
  };

  const touchInput = new TouchInput({
    engine,
    pickAt,
    screenWorld,
    zoomBetween: (factor, from, to) =>
      engine.renderer.camera.zoomBetween(
        factor,
        from,
        to,
        viewport(),
        engine.renderer.groundMesh,
      ),
    canAct,
    onPinchStart: () => {
      pointerState.panning = false;
      pointerState.lastPan = null;
      pointerState.marqueeFrom = null;
      pointerState.marqueeScreenFrom = null;
      engine.selectionBox = null;
      useGame.getState().patch({ marquee: null });
    },
  });

  const updateHover = (screen: Vec2): void => {
    const over = pickAt(screen);
    engine.hoveredId = over?.id ?? null;
    const state = useGame.getState();
    const attackable =
      over !== null && over.team !== state.playerTeam && engine.selectedEntities().length > 0;
    const style = state.supportMode !== null || attackable ? 'crosshair' : 'default';
    if (style !== lastCursorStyle) {
      lastCursorStyle = style;
      canvas.style.cursor = style;
    }
  };

  const pointer = createPointerHandlers({
    engine,
    canvas,
    state: pointerState,
    touchInput,
    viewport,
    battleFinished,
    screenWorld,
    pickAt,
    selectWithin,
  });
  const keyboard = attachBattleKeyboard(engine, () => {
    pointer.resetGesture();
    touchInput.cancelAll();
  });

  let lastCameraFrame = 0;
  const cameraFrame = (now: number): void => {
    const delta = lastCameraFrame === 0 ? 0 : Math.min(0.1, (now - lastCameraFrame) / 1000);
    lastCameraFrame = now;

    if (battleFinished()) keyboard.held.clear();
    const speed = PAN_SPEED * delta * (engine.renderer.camera.distance / 620);
    const pan = arrowPanDelta(keyboard.held, speed);
    if (!battleFinished() && (pan.x !== 0 || pan.y !== 0)) {
      engine.renderer.camera.panBy(pan.x, pan.y);
    }

    // Expensive terrain raycasts and entity picks happen at most once a frame.
    const busy =
      pointerState.panning ||
      pointerState.marqueeFrom !== null ||
      engine.supportAim !== null ||
      touchInput.active;
    if (pointerState.lastPointer !== null && !busy && !battleFinished()) {
      const camera = engine.renderer.camera;
      const cameraKey = `${camera.target.x}:${camera.target.y}:${camera.distance}`;
      const moved = pointerState.pointerDirty || cameraKey !== lastCameraKey;
      if (moved) engine.cursorWorld = screenWorld(pointerState.lastPointer);
      if (moved || engine.world.tick !== lastHoverTick) {
        updateHover(pointerState.lastPointer);
        lastHoverTick = engine.world.tick;
      }
      pointerState.pointerDirty = false;
      lastCameraKey = cameraKey;
    }

    if (cameraRunning) requestAnimationFrame(cameraFrame);
  };

  let cameraRunning = true;
  requestAnimationFrame(cameraFrame);

  canvas.addEventListener('pointerdown', pointer.down);
  canvas.addEventListener('pointermove', pointer.move);
  canvas.addEventListener('pointerup', pointer.up);
  canvas.addEventListener('pointercancel', pointer.cancel);
  canvas.addEventListener('wheel', pointer.wheel, { passive: false });
  canvas.addEventListener('contextmenu', pointer.contextMenu);

  return () => {
    cameraRunning = false;
    canvas.removeEventListener('pointerdown', pointer.down);
    canvas.removeEventListener('pointermove', pointer.move);
    canvas.removeEventListener('pointerup', pointer.up);
    canvas.removeEventListener('pointercancel', pointer.cancel);
    canvas.removeEventListener('wheel', pointer.wheel);
    canvas.removeEventListener('contextmenu', pointer.contextMenu);
    keyboard.detach();
  };
}
