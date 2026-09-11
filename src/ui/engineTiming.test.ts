import { afterEach, describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { playerWorld } from '../../tests/support';
import type { Renderer } from '../render3d/scene';
import { Engine } from './engine';
import type { IncomingFireDirections } from './incomingFireDirections';
import { useGame } from './store';

interface RendererHarness {
  renderer: Renderer;
  beginKillingBlow: ReturnType<typeof vi.fn>;
  draw: ReturnType<typeof vi.fn>;
  spawnSmoke: ReturnType<typeof vi.fn>;
  spawnVentSteam: ReturnType<typeof vi.fn>;
}

function rendererHarness(reducedMotion = false): RendererHarness {
  const beginKillingBlow = vi.fn();
  const draw = vi.fn();
  const spawnSmoke = vi.fn();
  const spawnVentSteam = vi.fn();
  const renderer = {
    camera: { target: { x: 0, y: 0 }, azimuth: -Math.PI / 2, distance: 470, reducedMotion, beginKillingBlow },
    consumeEvents: vi.fn(),
    destroy: vi.fn(),
    draw,
    drawCalls: 0,
    positionOf: vi.fn(() => ({ x: 0, y: 0 })),
    snapshot: vi.fn(),
    spawnSmoke,
    spawnVentSteam,
    ventOf: vi.fn((_id: number, out: Vector3) => { out.set(4, 12, 6); return true; }),
  } as unknown as Renderer;
  return { renderer, beginKillingBlow, draw, spawnSmoke, spawnVentSteam };
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
    tick: 0,
    finished: false,
    outcomePending: false,
    winner: null,
  });
});

describe('engine presentation timing', () => {
  it.each([false, true])(
    'holds the results for a two-second killing-blow camera push (reduced motion: %s)',
    (reducedMotion) => {
      const world = playerWorld(`killing-blow-results-hold-${reducedMotion}`);
      const enemies = world.entities.filter((entity) => entity.team !== (world.playerTeam ?? 0));
      const wreck = enemies.at(-1);
      expect(wreck).toBeDefined();
      if (wreck === undefined) return;
      for (const enemy of enemies) enemy.destroyed = true;
      world.vision?.visible.add(wreck.id);
      world.events.push({
        type: 'mech_destroyed',
        tick: world.tick + 1,
        entityId: wreck.id,
        method: 'centre_torso',
      });

      const harness = rendererHarness(reducedMotion);
      const engine = new Engine(world, harness.renderer, 10_000);
      useGame.setState({ paused: false, speed: 4, finished: false, winner: null });

      engine.forceStep();

      expect(world.finished).toBe(true);
      expect(harness.beginKillingBlow).toHaveBeenCalledOnce();
      expect(harness.beginKillingBlow).toHaveBeenCalledWith(wreck.pos, 2);
      expect(useGame.getState().outcomePending).toBe(true);
      const terminalTick = world.tick;

      tick(engine, 0.1);
      expect(useGame.getState().finished).toBe(false);
      expect(useGame.getState().outcomePending).toBe(true);
      expect(useGame.getState().winner).toBeNull();
      tick(engine, 1.79);
      expect(useGame.getState().finished).toBe(false);
      expect(world.tick).toBe(terminalTick);

      tick(engine, 0.11);
      expect(useGame.getState().finished).toBe(true);
      expect(useGame.getState().outcomePending).toBe(false);
      expect(useGame.getState().winner).toBe(world.winner);
      expect(world.tick).toBe(terminalTick);
      engine.destroy();
    },
  );

  it('does not treat the player lance defeat as a killing blow', () => {
    const world = playerWorld('player-defeat-camera');
    const playerTeam = world.playerTeam ?? 0;
    const friendlies = world.entities.filter((entity) => entity.team === playerTeam);
    const wreck = friendlies.at(-1);
    expect(wreck).toBeDefined();
    if (wreck === undefined) return;
    for (const friendly of friendlies) friendly.destroyed = true;
    world.events.push({
      type: 'mech_destroyed',
      tick: world.tick + 1,
      entityId: wreck.id,
      method: 'centre_torso',
    });
    const harness = rendererHarness();
    const engine = new Engine(world, harness.renderer, 10_000);

    engine.forceStep();
    tick(engine, 0.1);

    expect(world.finished).toBe(true);
    expect(world.winner).not.toBe(playerTeam);
    expect(harness.beginKillingBlow).not.toHaveBeenCalled();
    expect(useGame.getState().finished).toBe(true);
    expect(useGame.getState().outcomePending).toBe(false);
    engine.destroy();
  });

  it('does not treat a mutual destruction draw as a killing blow', () => {
    const world = playerWorld('mutual-destruction-camera');
    const playerTeam = world.playerTeam ?? 0;
    const friendlyWreck = world.entities.find((entity) => entity.team === playerTeam);
    const enemyWreck = world.entities.find((entity) => entity.team !== playerTeam);
    expect(friendlyWreck).toBeDefined();
    expect(enemyWreck).toBeDefined();
    if (friendlyWreck === undefined || enemyWreck === undefined) return;
    for (const entity of world.entities) entity.destroyed = true;
    world.events.push(
      {
        type: 'mech_destroyed',
        tick: world.tick + 1,
        entityId: enemyWreck.id,
        method: 'centre_torso',
      },
      {
        type: 'mech_destroyed',
        tick: world.tick + 1,
        entityId: friendlyWreck.id,
        method: 'centre_torso',
      },
    );
    const harness = rendererHarness();
    const engine = new Engine(world, harness.renderer, 10_000);

    engine.forceStep();
    tick(engine, 0.1);

    expect(world.finished).toBe(true);
    expect(world.winner).toBeNull();
    expect(harness.beginKillingBlow).not.toHaveBeenCalled();
    expect(useGame.getState().finished).toBe(true);
    expect(useGame.getState().outcomePending).toBe(false);
    engine.destroy();
  });

  it('does not reveal a hidden terminal wreck through the camera', () => {
    const world = playerWorld('hidden-killing-blow-camera');
    const playerTeam = world.playerTeam ?? 0;
    const enemies = world.entities.filter((entity) => entity.team !== playerTeam);
    const wreck = enemies.at(-1);
    expect(wreck).toBeDefined();
    if (wreck === undefined) return;
    const width = world.terrain.width * world.terrain.tileSize;
    const height = world.terrain.height * world.terrain.tileSize;
    for (const friendly of world.entities.filter((entity) => entity.team === playerTeam)) {
      friendly.pos = { x: world.terrain.tileSize, y: world.terrain.tileSize };
    }
    wreck.pos = { x: width - world.terrain.tileSize, y: height - world.terrain.tileSize };
    world.vision?.visible.clear();
    world.vision?.observedHulks.clear();
    for (const enemy of enemies) enemy.destroyed = true;
    world.events.push({
      type: 'mech_destroyed',
      tick: world.tick + 1,
      entityId: wreck.id,
      method: 'centre_torso',
    });
    const harness = rendererHarness();
    const engine = new Engine(world, harness.renderer, 10_000);

    engine.forceStep();
    tick(engine, 0.1);

    expect(world.finished).toBe(true);
    expect(world.winner).toBe(playerTeam);
    expect(harness.beginKillingBlow).not.toHaveBeenCalled();
    expect(useGame.getState().finished).toBe(true);
    expect(useGame.getState().outcomePending).toBe(false);
    engine.destroy();
  });

  it('leaves an ordinary destruction and its camera timing untouched', () => {
    const world = playerWorld('ordinary-kill-camera');
    const enemy = world.entities.find((entity) => entity.team !== (world.playerTeam ?? 0));
    expect(enemy).toBeDefined();
    if (enemy === undefined) return;
    enemy.destroyed = true;
    world.events.push({
      type: 'mech_destroyed',
      tick: world.tick + 1,
      entityId: enemy.id,
      method: 'centre_torso',
    });
    const harness = rendererHarness();
    const engine = new Engine(world, harness.renderer, 10_000);

    engine.forceStep();

    expect(world.finished).toBe(false);
    expect(harness.beginKillingBlow).not.toHaveBeenCalled();
    engine.destroy();
  });

  it('publishes a non-kill battle ending without a camera hold', () => {
    const world = playerWorld('timeout-without-camera');
    const harness = rendererHarness();
    const engine = new Engine(world, harness.renderer, 1);

    engine.forceStep();
    tick(engine, 0.1);

    expect(world.finished).toBe(true);
    expect(harness.beginKillingBlow).not.toHaveBeenCalled();
    expect(useGame.getState().finished).toBe(true);
    engine.destroy();
  });

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

  it('routes each simulation event batch to the incoming-fire pool', () => {
    const world = playerWorld('incoming-event-route');
    const harness = rendererHarness();
    const consume = vi.fn();
    const incoming = { consume } as unknown as IncomingFireDirections;
    const selected = world.entities.find((entity) => entity.team === (world.playerTeam ?? 0));
    if (selected === undefined) throw new Error('missing player mech');
    const engine = new Engine(world, harness.renderer, 10_000, incoming);
    useGame.setState({ selection: [selected.id] });

    engine.forceStep();

    expect(consume).toHaveBeenCalledOnce();
    expect(consume.mock.calls[0]?.[0]).toBe(world);
    expect(consume.mock.calls[0]?.[2]).toEqual([selected.id]);
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

  it('paces anchored vent steam from the same accelerated presentation clock', () => {
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
    expect(harness.spawnVentSteam).not.toHaveBeenCalled();
    tick(engine, 0.09);
    expect(harness.spawnVentSteam).toHaveBeenCalledWith(new Vector3(4, 12, 6));
    expect(harness.spawnSmoke).not.toHaveBeenCalled();
    engine.destroy();
  });
});
