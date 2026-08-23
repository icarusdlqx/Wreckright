import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Engine } from './engine';
import { attachBattleKeyboard } from './inputKeyboard';
import { useGame } from './store';

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
    expect(useGame.getState()).toMatchObject({
      orderMode: null,
      queueOrders: false,
      selection: [],
      supportMode: null,
    });
    keyboard.detach();
  });
});
