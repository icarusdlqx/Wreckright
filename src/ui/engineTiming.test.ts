import { afterEach, describe, expect, it, vi } from 'vitest';
import { playerWorld } from '../../tests/support';
import type { Renderer } from '../render3d/scene';
import { Engine } from './engine';
import { useGame } from './store';

interface RendererHarness {
  renderer: Renderer;
  draw: ReturnType<typeof vi.fn>;
  spawnSmoke: ReturnType<typeof vi.fn>;
}

function rendererHarness(reducedMotion = false): RendererHarness {
  const draw = vi.fn();
  const spawnSmoke = vi.fn();
  const renderer = {
    camera: { target: { x: 0, y: 0 }, reducedMotion },
    consumeEvents: vi.fn(),
    destroy: vi.fn(),
    draw,
    drawCalls: 0,
    positionOf: vi.fn(() => ({ x: 0, y: 0 })),
    snapshot: vi.fn(),
    spawnSmoke,
  } as unknown as Renderer;
  return { renderer, draw, spawnSmoke };
}

function tick(engine: Engine, deltaSeconds: number): void {
  (engine as unknown as { tick(delta: number, rawMs?: number): void }).tick(
    deltaSeconds,
    deltaSeconds * 1_000,
  );
}

afterEach(() => {
  useGame.setState({
    paused: false,
    speed: 1,
    selection: [],
    orderMode: null,
    supportMode: null,
  });
});

describe('engine presentation timing', () => {
  it('snaps to the final simulation pose while finished effects keep advancing', () => {
    const world = playerWorld('finished-presentation');
    world.finished = true;
    const harness = rendererHarness();
    const engine = new Engine(world, harness.renderer, 10_000);
    useGame.setState({ paused: false, speed: 4, selection: [] });

    tick(engine, 0.025);

    expect(harness.draw).toHaveBeenCalledOnce();
    const call = harness.draw.mock.calls[0];
    expect(call?.[1]).toBe(1);
    expect(call?.[2]).toBeCloseTo(0.025);
    expect(call?.[4]).toBeCloseTo(0.1);
    engine.destroy();
  });

  it('passes the current battle speed to event audio', () => {
    const world = playerWorld('audio-playback-speed');
    const harness = rendererHarness();
    const engine = new Engine(world, harness.renderer, 10_000);
    const consume = vi.spyOn(engine.audio, 'consume').mockImplementation(() => undefined);
    useGame.setState({ speed: 4 });

    engine.forceStep();

    expect(consume).toHaveBeenCalledOnce();
    expect(consume.mock.calls[0]?.[2]).toBe(4);
    engine.destroy();
  });

  it('passes the renderer reduced-motion state to event audio', () => {
    const world = playerWorld('audio-reduced-motion');
    const harness = rendererHarness(true);
    const engine = new Engine(world, harness.renderer, 10_000);
    const consume = vi.spyOn(engine.audio, 'consume').mockImplementation(() => undefined);

    engine.forceStep();

    expect(consume).toHaveBeenCalledOnce();
    expect(consume.mock.calls[0]?.[3]).toBe(true);
    engine.destroy();
  });

  it('paces smoke from the same accelerated presentation clock', () => {
    const world = playerWorld('smoke-presentation-clock');
    world.finished = true;
    for (const entity of world.entities) entity.heat = 0;
    const hot = world.entities.find((entity) => entity.team === (world.playerTeam ?? 0));
    expect(hot).toBeDefined();
    if (hot === undefined) return;
    hot.heat = hot.heatCapacity * 0.7;
    const harness = rendererHarness();
    const engine = new Engine(world, harness.renderer, 10_000);
    useGame.setState({ paused: false, speed: 4, selection: [] });

    tick(engine, 0.09);
    expect(harness.spawnSmoke).not.toHaveBeenCalled();
    tick(engine, 0.09);
    expect(harness.spawnSmoke).toHaveBeenCalled();
    engine.destroy();
  });
});
