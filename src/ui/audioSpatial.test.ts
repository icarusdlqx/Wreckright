import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TacticalCamera } from '../render3d/camera';
import { AudioDirector } from './audio';
import { AudioGraph, FIELD_VOICE_LIMIT, TERMINAL_VOICE_RESERVE, oscillator } from './audioGraph';
import { fieldPlacement } from './audioPlacement';
import { writeAudioPreferences } from './audioPreference';
import { FakeContext, FakeNode, cultureWorld, sensorDetect } from './audioScoreGraphTestSupport';
import { SCORE_CLOSE_DELAY_MS, SCORE_SOURCE_COUNT } from './audioScoreGraph';
import { playOrder, playPowerSweep } from './audioVoices';

const graphs: AudioGraph[] = [];
const directors: AudioDirector[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockReturnValue(250);
  vi.stubGlobal('AudioContext', FakeContext as unknown as typeof AudioContext);
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
});

afterEach(() => {
  for (const graph of graphs.splice(0)) graph.close();
  for (const director of directors.splice(0)) director.destroy();
  vi.advanceTimersByTime(SCORE_CLOSE_DELAY_MS);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  FakeContext.instances.length = 0;
});

function graphHarness(): { graph: AudioGraph; context: FakeContext } {
  const graph = AudioGraph.create(false);
  if (graph === null) throw new Error('audio test requires its mock context');
  graphs.push(graph);
  return { graph, context: FakeContext.instances.at(-1)! };
}

function nodeCounts(context: FakeContext): number[] {
  return [context.sources.length, context.gains.length, context.filters.length, context.panners.length];
}

describe('camera-relative sound placement', () => {
  it('matches the actual tactical projection on both sides of the camera', () => {
    const camera = new TacticalCamera(true);
    camera.target = { x: 400, y: 400 };
    const viewport = { width: 1280, height: 720 };
    for (const point of [{ x: 300, y: 400 }, { x: 500, y: 400 }]) {
      const screen = camera.worldToScreen(point, viewport);
      const placement = fieldPlacement(point, camera.target, camera.azimuth, camera.distance);
      expect(Math.sign(placement.pan!)).toBe(Math.sign(screen.x - viewport.width / 2));
      expect(Math.abs(placement.pan!)).toBeGreaterThan(0.3);
      expect(placement.distance).toBe(100);
      expect(placement.level).toBeCloseTo((1 - 100 / 900) ** 1.4, 12);
    }
  });

  it('tracks camera translation, bearing and zoom while retaining distance attenuation', () => {
    const at = { x: 100, y: 0 };
    expect(fieldPlacement(at, { x: 0, y: 0 }, -Math.PI / 2, 470).pan).toBeLessThan(0);
    expect(fieldPlacement(at, { x: 200, y: 0 }, -Math.PI / 2, 470).pan).toBeGreaterThan(0);
    expect(fieldPlacement(at, { x: 0, y: 0 }, Math.PI / 2, 470).pan).toBeGreaterThan(0);
    expect(Math.abs(fieldPlacement(at, { x: 0, y: 0 }, -Math.PI / 2, 160).pan!))
      .toBeGreaterThan(Math.abs(fieldPlacement(at, { x: 0, y: 0 }, -Math.PI / 2, 1100).pan!));
    expect(fieldPlacement(at, at).pan).toBeCloseTo(0, 12);
    expect(fieldPlacement({ x: 900, y: 0 }, { x: 0, y: 0 }).level).toBe(0);
    expect(fieldPlacement({ x: Infinity, y: 0 }, at).level).toBe(0);
  });

  it('routes an admitted field source through a real stereo node and the effects bus', () => {
    const { graph, context } = graphHarness();
    playPowerSweep(graph, 360, 50, 0.9, { level: 0.8, distance: 100, pan: -0.6 });
    expect(context.sources).toHaveLength(1);
    expect(context.panners).toHaveLength(1);
    expect(context.panners[0]!.pan.value).toBe(-0.6);
    expect(context.filters[0]!.frequency.value).toBe(15800);
    expect(context.filters[0]!.connections).toEqual([context.panners[0]]);
    expect(context.panners[0]!.connections).toEqual([graph.mixer.effects]);
    expect((graph.mixer.effects as unknown as FakeNode).connections).toEqual([graph.master]);
    expect(context.sources[0]!.stops[0]).toBeGreaterThan(context.sources[0]!.starts[0]!);
  });

  it('keeps console feedback centred and independent of the effects slider', () => {
    const { graph, context } = graphHarness();
    writeAudioPreferences({ effects: 0 });
    playPowerSweep(graph, 360, 50, 0.9, { level: 1, distance: 10, pan: 0.8 });
    expect(context.sources).toHaveLength(0);
    expect(context.panners).toHaveLength(0);
    const frame = graph.begin({ level: 0.1, distance: null, pan: 1 });
    expect(frame).not.toBeNull();
    expect((frame!.out as unknown as FakeNode).connections).toEqual([graph.mixer.interface]);
    playOrder(graph);
    expect(context.sources).toHaveLength(1);
    expect(context.panners).toHaveLength(0);
    writeAudioPreferences({ interface: 0 });
    const before = nodeCounts(context);
    playOrder(graph);
    expect(nodeCounts(context)).toEqual(before);
  });

  it('rejects excess voices before creating sources, filters, gains or stereo nodes', () => {
    const { graph, context } = graphHarness();
    for (let index = 0; index < 1000; index += 1) {
      playPowerSweep(graph, 360, 50, 0.9, { level: 1, distance: 30, pan: 0.4 });
    }
    const ordinaryCount = FIELD_VOICE_LIMIT - TERMINAL_VOICE_RESERVE;
    expect(context.sources).toHaveLength(ordinaryCount);
    expect(context.panners).toHaveLength(ordinaryCount);
    const before = nodeCounts(context);
    playPowerSweep(graph, 360, 50, 0.9, { level: 1, distance: 30 });
    expect(nodeCounts(context)).toEqual(before);
    for (let index = 0; index < TERMINAL_VOICE_RESERVE; index += 1) {
      const frame = graph.begin({ level: 1, distance: 30, pan: -0.4 }, 'terminal');
      expect(frame).not.toBeNull();
      oscillator(frame!, frame!.now, 0.2, 90, 30, 0.2, 'sine');
    }
    expect(context.sources).toHaveLength(FIELD_VOICE_LIMIT);
    expect(context.panners).toHaveLength(FIELD_VOICE_LIMIT);
    const saturated = nodeCounts(context);
    expect(graph.begin({ level: 1, distance: 30 }, 'terminal')).toBeNull();
    expect(nodeCounts(context)).toEqual(saturated);
    expect(context.sources.every((source) => source.stops.length === 1)).toBe(true);
  });

  it('creates no sources or panners for hidden or sensor-only hostiles, then pans an optical contact', () => {
    const { world, enemy } = cultureWorld('spatial-contact-privacy', 'linewrought');
    enemy.pos = { x: 300, y: 400 };
    const audio = new AudioDirector();
    directors.push(audio);
    audio.setListener({ x: 400, y: 400 }, -Math.PI / 2, 470);
    const event = { type: 'shutdown' as const, tick: world.tick, entityId: enemy.id, forced: false };
    audio.consume(world, [event]);
    expect(FakeContext.instances).toHaveLength(0);
    audio.unlock();
    const context = FakeContext.instances.at(-1)!;
    const before = nodeCounts(context);
    expect(context.sources).toHaveLength(SCORE_SOURCE_COUNT);
    audio.consume(world, [event]);
    expect(nodeCounts(context)).toEqual(before);
    sensorDetect(world, enemy);
    audio.consume(world, [event]);
    expect(nodeCounts(context)).toEqual(before);
    world.vision!.visible.add(enemy.id);
    audio.consume(world, [event]);
    expect(context.sources).toHaveLength(SCORE_SOURCE_COUNT + 1);
    expect(context.panners).toHaveLength(1);
    expect(context.panners[0]!.pan.value).toBeCloseTo(100 / (470 * 0.55));
    audio.setListener({ x: 200, y: 400 }, -Math.PI / 2, 470);
    audio.consume(world, [event]);
    expect(context.panners[1]!.pan.value).toBeCloseTo(-100 / (470 * 0.55));
  });

  it('can fall back to mono without changing source admission on an older context', () => {
    const { graph, context } = graphHarness();
    Object.defineProperty(context, 'createStereoPanner', { value: undefined });
    playPowerSweep(graph, 360, 50, 0.9, { level: 0.8, distance: 100, pan: -0.6 });
    expect(context.sources).toHaveLength(1);
    expect(context.panners).toHaveLength(0);
    expect(context.filters[0]!.connections).toEqual([graph.mixer.effects]);
  });
});
