import type { MechEntity, Vec2 } from '../sim/types';
import { isOperational } from '../sim/types';
import { setFollowSelection } from './cameraNavigation';
import type { Engine } from './engine';
import { useGame } from './store';
import { clearSupportModeOnSuccess, type TouchInput } from './touchInput';

const DRAG_THRESHOLD = 6;
const MECH_DRAG_THRESHOLD = 14;
const PAN_PER_PIXEL = 0.0022;
const ZOOM_STEP = 1.12;

export interface PointerGestureState {
  panning: boolean;
  lastPan: Vec2 | null;
  orderedAt: number;
  marqueeFrom: Vec2 | null;
  marqueeScreenFrom: Vec2 | null;
  marqueeFromMech: number | null;
  pressedOnMech: { id: number; screen: Vec2; world: Vec2 } | null;
  lastPointer: Vec2 | null;
  pointerDirty: boolean;
}

export interface PointerHandlers {
  down: (event: PointerEvent) => void;
  move: (event: PointerEvent) => void;
  up: (event: PointerEvent) => void;
  cancel: (event: PointerEvent) => void;
  wheel: (event: WheelEvent) => void;
  contextMenu: (event: MouseEvent) => void;
  resetGesture: () => void;
}

interface PointerHandlerOptions {
  engine: Engine;
  canvas: HTMLCanvasElement;
  state: PointerGestureState;
  touchInput: TouchInput;
  viewport: () => { width: number; height: number };
  battleFinished: () => boolean;
  screenWorld: (screen: Vec2) => Vec2;
  pickAt: (screen: Vec2) => MechEntity | null;
  selectWithin: (a: Vec2, b: Vec2, add: boolean) => void;
}

export function createPointerGestureState(): PointerGestureState {
  return {
    panning: false,
    lastPan: null,
    orderedAt: -1_000,
    marqueeFrom: null,
    marqueeScreenFrom: null,
    marqueeFromMech: null,
    pressedOnMech: null,
    lastPointer: null,
    pointerDirty: false,
  };
}

function pointerToScreen(
  canvas: HTMLCanvasElement,
  event: PointerEvent | WheelEvent | MouseEvent,
): Vec2 {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

/** macOS and Firefox can report a Ctrl+click as button zero. */
function isSecondary(event: PointerEvent | MouseEvent): boolean {
  return event.button === 2 || (event.button === 0 && event.ctrlKey);
}

export function createPointerHandlers(options: PointerHandlerOptions): PointerHandlers {
  const {
    engine,
    canvas,
    state,
    touchInput,
    viewport,
    battleFinished,
    screenWorld,
    pickAt,
    selectWithin,
  } = options;
  const toWorld = (event: PointerEvent | WheelEvent): Vec2 =>
    screenWorld(pointerToScreen(canvas, event));

  const resetGesture = (): void => {
    state.pressedOnMech = null;
    state.marqueeFrom = null;
    state.marqueeScreenFrom = null;
    state.marqueeFromMech = null;
    state.panning = false;
    state.lastPan = null;
    engine.selectionBox = null;
    engine.supportAim = null;
    useGame.getState().patch({ marquee: null });
  };

  const down = (event: PointerEvent): void => {
    if (battleFinished()) return;
    state.pressedOnMech = null;
    engine.audio.unlock();
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is only a convenience for drags leaving the canvas.
    }
    const world = toWorld(event);
    const game = useGame.getState();

    if (event.pointerType === 'touch') {
      touchInput.start(event.pointerId, pointerToScreen(canvas, event), world);
      return;
    }

    if (event.button === 1) {
      state.panning = true;
      state.lastPan = pointerToScreen(canvas, event);
      return;
    }
    if (!game.briefingSeen) return;

    if (game.supportMode !== null && event.button === 0 && !event.ctrlKey) {
      if (engine.supportNeedsHeading(game.supportMode)) {
        engine.supportAim = { call: game.supportMode, at: world, to: world };
        return;
      }
      const result = engine.callSupport(game.supportMode, world);
      clearSupportModeOnSuccess(result, () => game.setSupportMode(null));
      return;
    }

    if (isSecondary(event)) {
      state.orderedAt = event.timeStamp;
      const target = pickAt(pointerToScreen(canvas, event));
      if (target !== null && target.team !== game.playerTeam && isOperational(target)) {
        game.patch({ inspectedId: target.id });
        engine.orderAttack(target.id, null);
      } else {
        // Shift on the right button is "run there": a run order on a standing
        // machine, and a leg behind whatever it is already walking.
        engine.orderMove(world, event.shiftKey, { queued: event.shiftKey });
      }
      game.setOrderMode(null);
      return;
    }

    if (game.orderMode !== null) {
      if (game.orderMode === 'move' || game.orderMode === 'run') {
        engine.orderMove(world, game.orderMode === 'run', { queued: event.shiftKey });
      } else if (game.orderMode === 'attack_move') {
        engine.orderMove(world, false, { engage: true, queued: event.shiftKey });
      } else if (game.orderMode === 'jump') {
        engine.orderJump(world);
      } else {
        const target = pickAt(pointerToScreen(canvas, event));
        if (target !== null && target.team !== game.playerTeam) {
          game.patch({ inspectedId: target.id });
          engine.orderAttack(
            target.id,
            game.orderMode === 'called_shot' ? game.calledShotLocation : null,
          );
        }
      }
      game.setOrderMode(null);
      return;
    }

    const picked = pickAt(pointerToScreen(canvas, event));
    if (picked === null) {
      state.marqueeFrom = world;
      state.marqueeScreenFrom = pointerToScreen(canvas, event);
      engine.selectionBox = { a: world, b: world };
      game.patch({ marquee: null });
      return;
    }

    // Any click on a hostile is also a look: the sidebar keeps its damage
    // readable while the lance works on it.
    if (picked.team !== game.playerTeam) game.patch({ inspectedId: picked.id });

    if (
      picked.team !== game.playerTeam &&
      isOperational(picked) &&
      engine.selectedEntities().length > 0
    ) {
      engine.orderAttack(picked.id, null);
      return;
    }

    engine.audio.select();
    if (event.shiftKey) {
      const next = game.selection.includes(picked.id)
        ? game.selection.filter((id) => id !== picked.id)
        : [...game.selection, picked.id];
      game.setSelection(next);
    } else {
      game.setSelection([picked.id]);
    }
    if (picked.team === game.playerTeam) {
      state.pressedOnMech = {
        id: picked.id,
        screen: pointerToScreen(canvas, event),
        world,
      };
    }
  };

  const move = (event: PointerEvent): void => {
    if (battleFinished()) return;
    if (event.pointerType === 'touch') {
      touchInput.move(event.pointerId, pointerToScreen(canvas, event));
      return;
    }

    const screen = pointerToScreen(canvas, event);
    state.lastPointer = screen;
    state.pointerDirty = true;

    if (state.pressedOnMech !== null) {
      const drag = Math.hypot(
        screen.x - state.pressedOnMech.screen.x,
        screen.y - state.pressedOnMech.screen.y,
      );
      if (drag > MECH_DRAG_THRESHOLD) {
        state.marqueeFrom = state.pressedOnMech.world;
        state.marqueeScreenFrom = state.pressedOnMech.screen;
        state.marqueeFromMech = state.pressedOnMech.id;
        engine.selectionBox = { a: state.pressedOnMech.world, b: state.pressedOnMech.world };
        useGame.getState().patch({ marquee: null });
        state.pressedOnMech = null;
      }
    }

    const aim = engine.supportAim;
    if (aim !== null) {
      engine.supportAim = { ...aim, to: screenWorld(screen) };
      return;
    }

    if (state.marqueeFrom !== null) {
      engine.selectionBox = { a: state.marqueeFrom, b: screenWorld(screen) };
      if (state.marqueeScreenFrom !== null) {
        useGame.getState().patch({
          marquee: {
            x: Math.min(state.marqueeScreenFrom.x, screen.x),
            y: Math.min(state.marqueeScreenFrom.y, screen.y),
            width: Math.abs(screen.x - state.marqueeScreenFrom.x),
            height: Math.abs(screen.y - state.marqueeScreenFrom.y),
          },
        });
      }
      return;
    }

    if (!state.panning || state.lastPan === null) return;
    setFollowSelection(false);
    const scale = engine.renderer.camera.distance * PAN_PER_PIXEL;
    engine.renderer.camera.panBy(
      (state.lastPan.x - screen.x) * scale,
      (screen.y - state.lastPan.y) * scale,
    );
    state.lastPan = screen;
  };

  const up = (event: PointerEvent): void => {
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);

    if (battleFinished()) {
      if (event.pointerType === 'touch') touchInput.cancel(event.pointerId);
      resetGesture();
      return;
    }
    if (event.pointerType === 'touch') {
      touchInput.finish(event.pointerId, pointerToScreen(canvas, event));
      return;
    }

    state.panning = false;
    state.lastPan = null;
    state.pressedOnMech = null;

    const aim = engine.supportAim;
    if (aim !== null) {
      engine.supportAim = null;
      const result = engine.callSupport(aim.call, aim.at, toWorld(event));
      clearSupportModeOnSuccess(result, () => useGame.getState().setSupportMode(null));
      return;
    }

    if (state.marqueeFrom === null) return;
    const screen = pointerToScreen(canvas, event);
    const dragged =
      state.marqueeScreenFrom !== null &&
      Math.hypot(
        screen.x - state.marqueeScreenFrom.x,
        screen.y - state.marqueeScreenFrom.y,
      ) > DRAG_THRESHOLD;
    const before = useGame.getState().selection;
    if (dragged && state.marqueeScreenFrom !== null) {
      selectWithin(state.marqueeScreenFrom, screen, event.shiftKey);
    } else if (!event.shiftKey) {
      useGame.getState().setSelection([]);
    }

    if (state.marqueeFromMech !== null && useGame.getState().selection.length === 0) {
      const kept = before.includes(state.marqueeFromMech) ? before : [state.marqueeFromMech];
      useGame.getState().setSelection(kept);
    }
    state.marqueeFrom = null;
    state.marqueeScreenFrom = null;
    state.marqueeFromMech = null;
    engine.selectionBox = null;
    useGame.getState().patch({ marquee: null });
  };

  const wheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (battleFinished()) return;
    engine.renderer.camera.zoomAt(
      event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP,
      pointerToScreen(canvas, event),
      viewport(),
      engine.renderer.groundMesh,
    );
  };

  const contextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    const game = useGame.getState();
    if (!game.briefingSeen || battleFinished()) return;
    if (event.timeStamp - state.orderedAt < 400 || game.supportMode !== null) return;

    const screen = pointerToScreen(canvas, event);
    const world = screenWorld(screen);
    const target = pickAt(screen);
    if (target !== null && target.team !== game.playerTeam && isOperational(target)) {
      engine.orderAttack(target.id, null);
    } else {
      engine.orderMove(world, event.shiftKey, { queued: event.shiftKey });
    }
    game.setOrderMode(null);
  };

  const cancel = (event: PointerEvent): void => {
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (event.pointerType === 'touch') touchInput.cancel(event.pointerId);
    resetGesture();
  };

  return { down, move, up, cancel, wheel, contextMenu, resetGesture };
}
