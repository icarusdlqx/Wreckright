import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Engine } from './engine';
import { attachInput } from './input';
import { useGame } from './store';

type Handler = (event: Record<string, unknown>) => void;

function harness(directional: boolean) {
  const handlers = new Map<string, Handler>();
  const canvas = {
    style: { cursor: '' },
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    removeEventListener: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => false,
    releasePointerCapture: vi.fn(),
  } as unknown as HTMLCanvasElement;
  const callSupport = vi.fn(() => ({ ok: false, reason: 'needs more RP' }));
  const engine = {
    world: { finished: false, tick: 0, entities: [] },
    renderer: {
      viewport: { width: 800, height: 600 },
      groundMesh: {},
      entityAtScreen: () => null,
      screenBodyOf: () => ({ x: 0, y: 0, radius: 0 }),
      camera: {
        distance: 500,
        target: { x: 0, y: 0 },
        screenToWorld: (point: { x: number; y: number }) => point,
        panBy: vi.fn(),
      },
    },
    audio: { unlock: vi.fn() },
    supportAim: null,
    supportNeedsHeading: vi.fn(() => directional),
    callSupport,
    selectedEntities: () => [],
  } as unknown as Engine;
  const detach = attachInput(engine, canvas);
  return { callSupport, detach, engine, handlers };
}

function pointer(type: 'pointerdown' | 'pointerup', handlers: Map<string, Handler>): void {
  handlers.get(type)?.({
    button: 0,
    clientX: 120,
    clientY: 160,
    ctrlKey: false,
    pointerId: 1,
    pointerType: 'mouse',
    shiftKey: false,
    timeStamp: 1,
  });
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  useGame.setState({
    briefingSeen: true,
    finished: false,
    playerTeam: 0,
    supportMode: 'sensor_probe',
    supportNotice: null,
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('desktop support input', () => {
  it.each([false, true])('keeps a rejected call armed (directional: %s)', (directional) => {
    useGame.setState({ supportMode: directional ? 'air_strike' : 'sensor_probe' });
    const { callSupport, detach, engine, handlers } = harness(directional);

    pointer('pointerdown', handlers);
    if (directional) pointer('pointerup', handlers);

    expect(callSupport).toHaveBeenCalledOnce();
    expect(useGame.getState().supportMode).toBe(directional ? 'air_strike' : 'sensor_probe');
    expect(useGame.getState().supportNotice).toBe('needs more RP');
    expect(engine.supportAim).toBeNull();
    detach();
  });
});
