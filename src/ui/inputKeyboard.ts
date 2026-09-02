import type { Engine } from './engine';
import {
  battleShortcutAllowedOnTarget,
  battleModalOpen,
  blocksBattleKey,
  isInteractiveKeyTarget,
  shouldIgnoreBattleKey,
} from './battleKeyboard';
import { resetCommanderView, toggleCommanderView } from './commanderViewState';
import { useGame } from './store';

interface AttachedBattleKeyboard {
  held: Set<string>;
  detach: () => void;
}

export function attachBattleKeyboard(
  engine: Engine,
  cancelPointerGesture: () => void,
): AttachedBattleKeyboard {
  resetCommanderView();
  const held = new Set<string>();

  const onKeyDown = (event: KeyboardEvent): void => {
    const state = useGame.getState();
    const modalOpen = battleModalOpen();
    const interactiveTarget = isInteractiveKeyTarget(event.target);
    if (
      shouldIgnoreBattleKey({
        briefingSeen: state.briefingSeen,
        finished: state.finished || engine.world.finished,
        interactiveTarget: blocksBattleKey(
          event.code,
          interactiveTarget && !battleShortcutAllowedOnTarget(event.code, event.target),
          modalOpen,
        ),
        code: event.code,
        repeat: event.repeat,
      })
    ) {
      return;
    }
    engine.audio.unlock();

    // Browser shortcuts must not double as orders. Control groups are the
    // exception because Ctrl/Cmd plus a digit is their deliberate binding.
    if ((event.ctrlKey || event.metaKey || event.altKey) && !event.code.startsWith('Digit')) {
      return;
    }

    held.add(event.code);
    switch (event.code) {
      case 'Backquote':
        event.preventDefault();
        cancelPointerGesture();
        toggleCommanderView();
        return;
      case 'Space':
        event.preventDefault();
        engine.togglePause();
        return;
      case 'KeyM':
        state.setOrderMode('move');
        return;
      case 'KeyR':
        state.setOrderMode('run');
        return;
      case 'KeyF':
        state.setOrderMode('attack');
        return;
      case 'KeyA':
        state.setOrderMode('attack_move');
        return;
      case 'KeyQ':
        engine.targetNearest();
        return;
      case 'KeyC':
        state.setOrderMode('called_shot');
        return;
      case 'KeyH':
        engine.toggleHoldFire();
        return;
      case 'KeyG':
        engine.setPosture('hold_position');
        return;
      case 'KeyS':
        engine.orderStop();
        return;
      case 'KeyV':
        engine.useAbilities();
        return;
      case 'KeyX':
        engine.alphaStrike();
        return;
      case 'KeyT':
        engine.toggleHeatSafety();
        return;
      case 'KeyJ':
        state.setOrderMode('jump');
        return;
      case 'Comma':
        engine.nudgeSpeed(-1);
        event.preventDefault();
        break;
      case 'Period':
        engine.nudgeSpeed(1);
        event.preventDefault();
        break;
      case 'KeyP':
        engine.togglePerf();
        break;
      case 'Escape':
        cancelPointerGesture();
        resetCommanderView();
        state.setOrderMode(null);
        state.setSupportMode(null);
        state.setSelection([]);
        state.patch({ inspectedId: null });
        return;
      case 'KeyE':
        state.setSelection(state.units.filter((unit) => unit.alive).map((unit) => unit.id));
        return;
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
      case 'Digit5':
      case 'Digit6':
      case 'Digit7':
      case 'Digit8':
      case 'Digit9': {
        const slot = Number(event.code.slice(5));
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          state.assignControlGroup(slot, state.selection);
          return;
        }
        const bound = (state.controlGroups[slot] ?? []).filter((id) =>
          state.units.some((unit) => unit.id === id && unit.alive),
        );
        if (bound.length > 0) state.setSelection(bound);
        return;
      }
      case 'Tab': {
        event.preventDefault();
        const ids = state.units.filter((unit) => unit.alive).map((unit) => unit.id);
        if (ids.length === 0) return;
        const current = state.selection[0];
        const index = current === undefined ? -1 : ids.indexOf(current);
        const next = ids[(index + 1) % ids.length];
        if (next !== undefined) state.setSelection([next]);
        return;
      }
      default:
        return;
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    held.delete(event.code);
  };

  const onBlur = (): void => {
    held.clear();
    cancelPointerGesture();
    resetCommanderView();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    held,
    detach: () => {
      resetCommanderView();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
