import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  commanderViewActive,
  resetCommanderView,
  setCommanderView,
} from './commanderViewState';
import { followingSelection, resetFollowSelection } from './cameraNavigation';
import type { Engine } from './engine';
import { attachBattleKeyboard } from './inputKeyboard';
import { useGame } from './store';

function press(
  handlers: Map<string, (event: KeyboardEvent) => void>,
  code: string,
  repeat = false,
): void {
  handlers.get('keydown')?.({
    altKey: false,
    code,
    ctrlKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    repeat,
    target: null,
  } as unknown as KeyboardEvent);
}

describe('battle keyboard input', () => {
  const handlers = new Map<string, (event: KeyboardEvent) => void>();

  beforeEach(() => {
    handlers.clear();
    vi.stubGlobal('Element', class Element {});
    vi.stubGlobal('document', { activeElement: null, querySelector: () => null });
    vi.stubGlobal('window', {
      addEventListener: (type: string, handler: (event: KeyboardEvent) => void) =>
        handlers.set(type, handler),
      removeEventListener: vi.fn(),
    });
    useGame.setState({
      briefingSeen: true,
      finished: false,
      orderMode: 'move',
      queueOrders: true,
      selection: [1],
      supportMode: 'air_strike',
    });
    resetCommanderView();
    resetFollowSelection();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('Escape cancels both queued intent and an in-progress pointer gesture', () => {
    const cancelPointerGesture = vi.fn();
    const engine = {
      world: { finished: false },
      audio: { unlock: vi.fn() },
    } as unknown as Engine;
    const keyboard = attachBattleKeyboard(engine, cancelPointerGesture);
    setCommanderView(true);

    handlers.get('keydown')?.({
      altKey: false,
      code: 'Escape',
      ctrlKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
      repeat: false,
      target: null,
    } as unknown as KeyboardEvent);

    expect(cancelPointerGesture).toHaveBeenCalledOnce();
    expect(commanderViewActive()).toBe(false);
    expect(useGame.getState()).toMatchObject({
      orderMode: null,
      queueOrders: false,
      selection: [],
      supportMode: null,
    });
    keyboard.detach();
  });

  it('toggles Commander view once per Backquote press', () => {
    const preventDefault = vi.fn();
    const cancelPointerGesture = vi.fn();
    const engine = {
      world: { finished: false },
      audio: { unlock: vi.fn() },
    } as unknown as Engine;
    const keyboard = attachBattleKeyboard(engine, cancelPointerGesture);
    const keydown = handlers.get('keydown');

    keydown?.({
      altKey: false,
      code: 'Backquote',
      ctrlKey: false,
      metaKey: false,
      preventDefault,
      repeat: false,
      target: null,
    } as unknown as KeyboardEvent);
    expect(commanderViewActive()).toBe(true);
    expect(cancelPointerGesture).toHaveBeenCalledOnce();

    keydown?.({
      altKey: false,
      code: 'Backquote',
      ctrlKey: false,
      metaKey: false,
      preventDefault,
      repeat: true,
      target: null,
    } as unknown as KeyboardEvent);
    expect(commanderViewActive()).toBe(true);
    expect(cancelPointerGesture).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();

    keyboard.detach();
    expect(commanderViewActive()).toBe(false);
  });

  it('keeps Backquote active while the Commander toggle is focused', () => {
    const cancelPointerGesture = vi.fn();
    const engine = {
      world: { finished: false },
      audio: { unlock: vi.fn() },
    } as unknown as Engine;
    const keyboard = attachBattleKeyboard(engine, cancelPointerGesture);
    const target = new Element();
    Object.assign(target, { closest: () => target });

    handlers.get('keydown')?.({
      altKey: false,
      code: 'Backquote',
      ctrlKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
      repeat: false,
      target,
    } as unknown as KeyboardEvent);

    expect(commanderViewActive()).toBe(true);
    expect(cancelPointerGesture).toHaveBeenCalledOnce();
    keyboard.detach();
  });

  it('resets Commander view on remount and window blur', () => {
    const cancelPointerGesture = vi.fn();
    const engine = {
      world: { finished: false },
      audio: { unlock: vi.fn() },
    } as unknown as Engine;

    setCommanderView(true);
    const keyboard = attachBattleKeyboard(engine, cancelPointerGesture);
    expect(commanderViewActive()).toBe(false);

    setCommanderView(true);
    handlers.get('blur')?.({} as KeyboardEvent);
    expect(commanderViewActive()).toBe(false);
    expect(cancelPointerGesture).toHaveBeenCalledOnce();
    keyboard.detach();
  });

  it('K asks for keep-facing and ignores auto-repeat', () => {
    const setPosture = vi.fn();
    const engine = {
      world: { finished: false },
      audio: { unlock: vi.fn() },
      setPosture,
    } as unknown as Engine;
    const keyboard = attachBattleKeyboard(engine, vi.fn());

    press(handlers, 'KeyK');
    press(handlers, 'KeyK', true);

    expect(setPosture).toHaveBeenCalledTimes(1);
    expect(setPosture).toHaveBeenCalledWith('keep_facing');
    keyboard.detach();
  });

  it('L toggles following the selection once per press', () => {
    const engine = {
      world: { finished: false },
      audio: { unlock: vi.fn() },
    } as unknown as Engine;
    const keyboard = attachBattleKeyboard(engine, vi.fn());

    press(handlers, 'KeyL');
    expect(followingSelection()).toBe(true);
    press(handlers, 'KeyL', true);
    expect(followingSelection()).toBe(true);
    press(handlers, 'KeyL');
    expect(followingSelection()).toBe(false);
    keyboard.detach();
  });

  it('remembers when a pan key went down until it comes up', () => {
    const engine = {
      world: { finished: false },
      audio: { unlock: vi.fn() },
      orderStop: vi.fn(),
    } as unknown as Engine;
    const keyboard = attachBattleKeyboard(engine, vi.fn());

    press(handlers, 'KeyS');
    const first = keyboard.pressedAt.get('KeyS');
    expect(first).toBeDefined();
    expect(keyboard.held.has('KeyS')).toBe(true);
    press(handlers, 'KeyS', true);
    expect(keyboard.pressedAt.get('KeyS')).toBe(first);

    handlers.get('keyup')?.({ code: 'KeyS' } as KeyboardEvent);
    expect(keyboard.pressedAt.has('KeyS')).toBe(false);
    expect(keyboard.held.has('KeyS')).toBe(false);
    keyboard.detach();
  });
});
