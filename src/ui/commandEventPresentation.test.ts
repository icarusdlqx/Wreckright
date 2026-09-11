import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playerWorld } from '../../tests/support';
import type { Renderer } from '../render3d/scene';
import type { SimEvent } from '../sim/events';
import { updateTeamVisions } from '../sim/sensors';
import { callSupport } from '../sim/support';
import type { World } from '../sim/types';
import type { AudioDirector } from './audio';
import { Engine } from './engineCore';
import { EnginePresentation } from './enginePresentation';
import { endFieldRadio, readRadioMessage } from './fieldRadio';
import { useGame } from './store';

const cleanup: (() => void)[] = [];

function rendererHarness() {
  const consumeEvents = vi.fn<(world: World, events: readonly SimEvent[]) => void>();
  const renderer = {
    camera: {
      target: { x: 40, y: 40 }, azimuth: -Math.PI / 2, distance: 470,
      reducedMotion: true, beginKillingBlow: vi.fn(),
    },
    consumeEvents, destroy: vi.fn(), draw: vi.fn(), snapshot: vi.fn(),
  } as unknown as Renderer;
  return { renderer, consumeEvents };
}

function darkWorld(seed: string): World {
  const world = playerWorld(seed);
  world.resources.set(0, 10_000);
  world.resources.set(1, 10_000);
  for (const entity of world.entities) {
    entity.pos = entity.team === 0 ? { x: 40, y: 40 } : { x: 850, y: 850 };
    entity.sensorRange = 0;
    entity.sightRange = 0;
    entity.autopilot = false;
  }
  updateTeamVisions(world);
  world.events.length = 0;
  return world;
}

function engineHarness(world: World) {
  const { renderer, consumeEvents } = rendererHarness();
  const engine = new Engine(world, renderer, 10_000);
  const audio = vi.spyOn(engine.audio, 'consume').mockImplementation(() => undefined);
  cleanup.push(() => engine.destroy());
  return { engine, renderer, consumeEvents, audio };
}

function presentationHarness(world: World) {
  const { renderer, consumeEvents } = rendererHarness();
  const consume = vi.fn();
  const audio = { consume, setListener: vi.fn() } as unknown as AudioDirector;
  const presentation = new EnginePresentation(world, renderer, audio, 10_000);
  cleanup.push(() => endFieldRadio(world));
  return { presentation, consumeEvents, consume };
}

function pausedFrame(engine: Engine): void {
  (engine as unknown as { tick(delta: number): void }).tick(0.1);
}

function supportEvents(batches: readonly (readonly SimEvent[])[]): SimEvent[] {
  return batches.flat().filter((event) =>
    event.type === 'support_called' || event.type === 'support_resolved',
  );
}

beforeEach(() => {
  useGame.setState(useGame.getInitialState(), true);
  useGame.setState({ paused: true, speed: 4, log: [], selection: [] });
});

afterEach(() => {
  for (const run of cleanup.splice(0)) run();
  vi.restoreAllMocks();
  useGame.setState(useGame.getInitialState(), true);
});

describe('command event presentation while paused', () => {
  it('delivers a real probe report and cue immediately, then publishes only coarse contacts', () => {
    const world = darkWorld('immediate-probe-presentation');
    const { engine, renderer, consumeEvents, audio } = engineHarness(world);
    if (world.vision === null) throw new Error('need player vision');
    const before = {
      tick: world.tick, rng: world.rng.save(), entities: structuredClone(world.entities),
      tiles: world.vision.tiles.slice(), explored: world.vision.explored.slice(),
      resources: world.resources.get(0)!,
    };

    expect(engine.callSupport('sensor_probe', { x: 850, y: 850 }).ok).toBe(true);

    expect(useGame.getState().log).toEqual(['Sensor sweep — 4 contacts']);
    expect(consumeEvents).toHaveBeenCalledOnce();
    const events = consumeEvents.mock.calls[0]![1];
    expect(events.map((event) => event.type)).toEqual(['support_called', 'support_resolved']);
    expect(events[1]).toMatchObject({ call: 'sensor_probe', contactCount: 4, tick: before.tick });
    expect(audio).toHaveBeenCalledExactlyOnceWith(world, events, 4, true);
    expect(engine.audio.listenAt).toEqual(renderer.camera.target);
    expect(world.events).toEqual([]);
    expect(world.support.pending).toEqual([]);
    expect(world.resources.get(0)).toBe(before.resources - world.rules.support.sensor_probe.cost);

    pausedFrame(engine);

    expect(useGame.getState().paused).toBe(true);
    expect(useGame.getState().contacts).toHaveLength(4);
    expect(useGame.getState().enemies).toEqual([]);
    expect(useGame.getState().resourcePoints).toBe(world.resources.get(0));
    for (const contact of useGame.getState().contacts) {
      expect(contact).toMatchObject({ current: true, source: 'sensor' });
      expect(Object.keys(contact).sort()).toEqual([
        'approximateRange', 'current', 'id', 'label', 'position', 'source', 'team',
      ]);
      expect(contact.position).not.toEqual({ x: 850, y: 850 });
    }
    expect(world.tick).toBe(before.tick);
    expect(world.rng.save()).toEqual(before.rng);
    expect(world.entities).toEqual(before.entities);
    expect(world.vision.tiles).toEqual(before.tiles);
    expect(world.vision.explored).toEqual(before.explored);
    expect(world.vision.visible.size).toBe(0);
    expect(consumeEvents).toHaveBeenCalledOnce();
    expect(audio).toHaveBeenCalledOnce();
  });

  it('preserves queued event order and never replays a command batch on another flush or step', () => {
    const world = darkWorld('command-batch-order');
    const { presentation, consumeEvents, consume } = presentationHarness(world);
    const message: SimEvent = {
      type: 'mission_message', tick: world.tick, text: 'Hold the crossing.',
    };
    world.events.push(message);
    expect(callSupport(world, 0, 'sensor_probe', { x: 850, y: 850 }).ok).toBe(true);

    presentation.presentEvents();

    const events = consumeEvents.mock.calls[0]![1];
    expect(events.map((event) => event.type)).toEqual([
      'mission_message', 'support_called', 'support_resolved',
    ]);
    expect(events[0]).toBe(message);
    expect(consume).toHaveBeenCalledExactlyOnceWith(world, events, 4, true);
    expect(readRadioMessage()?.text).toBe(message.text);
    expect(useGame.getState().log).toEqual(['Sensor sweep — 4 contacts', message.text]);

    presentation.presentEvents();
    expect(consumeEvents).toHaveBeenCalledOnce();
    expect(consume).toHaveBeenCalledOnce();
    presentation.forceStep();
    presentation.presentEvents();

    const rendered = supportEvents(consumeEvents.mock.calls.map((call) => call[1]));
    const heard = supportEvents(consume.mock.calls.map((call) => call[1] as SimEvent[]));
    expect(rendered.map((event) => event.type)).toEqual(['support_called', 'support_resolved']);
    expect(heard).toEqual(rendered);
    expect(useGame.getState().log.filter((line) => line.startsWith('Sensor sweep')))
      .toEqual(['Sensor sweep — 4 contacts']);
    expect(world.tick).toBe(1);
    expect(world.events).toEqual([]);
  });

  it('acknowledges an air strike immediately but keeps its impact on simulation time', () => {
    const world = darkWorld('paused-air-support-presentation');
    const { engine, consumeEvents, audio } = engineHarness(world);
    const before = { tick: world.tick, rng: world.rng.save(), entities: structuredClone(world.entities) };

    expect(engine.callSupport('air_strike', { x: 500, y: 500 }).ok).toBe(true);

    expect(consumeEvents).toHaveBeenCalledOnce();
    const events = consumeEvents.mock.calls[0]![1];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'support_called', call: 'air_strike', tick: before.tick });
    expect(audio).toHaveBeenCalledExactlyOnceWith(world, events, 4, true);
    expect(world.support.pending).toHaveLength(1);
    const arrival = world.support.pending[0]!.resolveTick;
    expect(arrival).toBe(before.tick + Math.round(world.rules.support.air_strike.delaySeconds / world.dt));

    pausedFrame(engine);
    expect(world.tick).toBe(before.tick);
    expect(world.rng.save()).toEqual(before.rng);
    expect(world.entities).toEqual(before.entities);
    expect(world.support.pending).toHaveLength(1);
    expect(useGame.getState().log).not.toContain('air strike on target');

    while (world.tick < arrival - 1) engine.forceStep();
    expect(world.support.pending).toHaveLength(1);
    expect(useGame.getState().log).not.toContain('air strike on target');
    engine.forceStep();
    engine.forceStep();

    expect(world.support.pending).toEqual([]);
    expect(supportEvents(consumeEvents.mock.calls.map((call) => call[1]))).toMatchObject([
      { type: 'support_called', call: 'air_strike', tick: before.tick },
      { type: 'support_resolved', call: 'air_strike', tick: arrival },
    ]);
    expect(useGame.getState().log.filter((line) => line === 'air strike on target')).toHaveLength(1);
  });

  it('does not disclose an opposing probe report or hidden damage through the immediate log and HUD', () => {
    const world = darkWorld('enemy-command-privacy');
    const { presentation } = presentationHarness(world);
    const hostile = world.entities.find((entity) => entity.team === 1)!;
    expect(callSupport(world, 1, 'sensor_probe', { x: 40, y: 40 }).ok).toBe(true);
    world.events.push({ type: 'location_destroyed', tick: world.tick, entityId: hostile.id, location: 'left_arm' });

    presentation.presentEvents();
    presentation.publish(null);

    expect(useGame.getState().log).toEqual([]);
    expect(useGame.getState().contacts).toEqual([]);
    expect(useGame.getState().enemies).toEqual([]);
    expect(readRadioMessage()).toBeNull();
    expect(world.tick).toBe(0);
    expect(world.events).toEqual([]);
  });

  it('reports a rejected call without charging, displaying an effect, or issuing an audio event', () => {
    const world = darkWorld('rejected-command-feedback');
    const { engine, consumeEvents, audio } = engineHarness(world);
    const before = world.resources.get(0);

    expect(engine.callSupport('sensor_probe', { x: NaN, y: 500 }).ok).toBe(false);

    expect(useGame.getState().log).toEqual(['choose a point on the map']);
    expect(consumeEvents).not.toHaveBeenCalled();
    expect(audio).not.toHaveBeenCalled();
    expect(world.resources.get(0)).toBe(before);
    expect(world.reveals).toEqual([]);
    expect(world.events).toEqual([]);
    expect(world.tick).toBe(0);
  });
});
