import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioDirector } from './audio';
import { AudioGraph } from './audioGraph';
import { MIXER_GAIN_COUNT } from './audioMixer';
import { readAudioMuted, writeAudioMuted, writeAudioPreferences } from './audioPreference';
import { SCORE_CLOSE_DELAY_MS, SCORE_GAIN_COUNT, SCORE_SOURCE_COUNT } from './audioScoreGraph';
import { FakeContext, FakeNode } from './audioScoreGraphTestSupport';
import { StrategicScoreDirector } from './audioStrategic';
import { playOrder, playPowerSweep } from './audioVoices';

const graphs: AudioGraph[] = [];
const directors: Array<AudioDirector | StrategicScoreDirector> = [];

beforeEach(() => {
  vi.useFakeTimers();
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
  vi.unstubAllGlobals();
  FakeContext.instances.length = 0;
});

function graphHarness(): { graph: AudioGraph; context: FakeContext } {
  const graph = AudioGraph.create(readAudioMuted());
  if (graph === null) throw new Error('audio test requires its mock context');
  graphs.push(graph);
  return { graph, context: FakeContext.instances.at(-1)! };
}

describe('shared audio mixer', () => {
  it('retains the existing default trim with three independent fixed buses', () => {
    const { graph, context } = graphHarness();
    expect(context.gains).toHaveLength(MIXER_GAIN_COUNT);
    expect(context.sources).toHaveLength(0);
    expect(graph.master.gain.value).toBe(0.5);
    expect([graph.mixer.effects, graph.mixer.music, graph.mixer.interface].map((bus) => bus.gain.value))
      .toEqual([1, 1, 1]);
    expect(new Set([graph.mixer.effects, graph.mixer.music, graph.mixer.interface]).size).toBe(3);
    for (const bus of [graph.mixer.effects, graph.mixer.music, graph.mixer.interface]) {
      expect((bus as unknown as FakeNode).connections).toEqual([graph.master]);
    }
    expect((graph.master as unknown as FakeNode).connections).toEqual([context.compressors[0]]);
    expect(context.compressors[0]!.connections).toEqual([context.destination]);
  });

  it('changes every channel live without allocating nodes or restarting sources', () => {
    const { graph, context } = graphHarness();
    const gains = [...context.gains];
    writeAudioPreferences({ master: 0.6, effects: 0.2, music: 0.8, interface: 0.4 });
    expect(graph.master.gain.value).toBeCloseTo(0.3);
    expect([graph.mixer.effects, graph.mixer.music, graph.mixer.interface].map((bus) => bus.gain.value))
      .toEqual([0.2, 0.8, 0.4]);
    expect(context.gains).toEqual(gains);
    expect(context.sources).toHaveLength(0);
    expect(graph.musicBus.master).toBe(graph.mixer.music);
    expect(graph.ambientBus.master).toBe(graph.mixer.effects);
  });

  it('mutes immediately after a scheduled gain change and restores the chosen master level', () => {
    const { graph, context } = graphHarness();
    writeAudioPreferences({ master: 0.7 });
    writeAudioMuted(true);
    expect(graph.master.gain.value).toBe(0);
    expect(context.gains[0]!.gain.automation.at(-1)?.method).toBe('cancel');
    playPowerSweep(graph, 360, 50, 0.9, { level: 1, distance: 10 });
    playOrder(graph);
    expect(context.sources).toHaveLength(0);
    writeAudioMuted(false);
    expect(graph.master.gain.value).toBeCloseTo(0.35);
  });

  it('makes quiet range compress earlier with lower output and preserves per-channel choices', () => {
    const { graph, context } = graphHarness();
    const compressor = context.compressors[0]!;
    expect([compressor.threshold.value, compressor.ratio.value]).toEqual([-18, 8]);
    writeAudioPreferences({ dynamicRange: 'quiet', effects: 0.7, music: 0.2 });
    expect([compressor.threshold.value, compressor.ratio.value]).toEqual([-28, 14]);
    expect(graph.master.gain.value).toBeCloseTo(0.425);
    expect(graph.mixer.effects.gain.value).toBe(0.7);
    expect(graph.mixer.music.gain.value).toBe(0.2);
    writeAudioPreferences({ dynamicRange: 'normal' });
    expect([compressor.threshold.value, compressor.ratio.value]).toEqual([-18, 8]);
    expect(graph.master.gain.value).toBe(0.5);
    expect(graph.mixer.music.gain.value).toBe(0.2);
  });

  it('does not create a context from stored settings or preference edits before a gesture', () => {
    writeAudioPreferences({ music: 0.35, master: 0.8 });
    const battle = new AudioDirector();
    const strategic = new StrategicScoreDirector();
    directors.push(battle, strategic);
    const lease = strategic.acquire('campaign', 0);
    expect(FakeContext.instances).toHaveLength(0);
    writeAudioPreferences({ effects: 0.4 });
    expect(FakeContext.instances).toHaveLength(0);
    battle.unlock();
    strategic.prepare();
    expect(FakeContext.instances).toHaveLength(2);
    for (const context of FakeContext.instances) {
      expect(context.gains[0]!.gain.value).toBeCloseTo(0.4);
      expect(context.gains[2]!.gain.value).toBe(0.35);
      expect(context.sources).toHaveLength(SCORE_SOURCE_COUNT);
    }
    lease.release();
  });

  it('routes battle and campaign score to music, weather to effects, and shares legacy mute', () => {
    const battle = new AudioDirector();
    const strategic = new StrategicScoreDirector();
    directors.push(battle, strategic);
    battle.setAmbient('overcast_day');
    battle.unlock();
    const lease = strategic.acquire('campaign', 0.5);
    strategic.prepare();
    const [battleContext, campaignContext] = FakeContext.instances;
    expect(battleContext).toBeDefined();
    expect(campaignContext).toBeDefined();
    for (const context of [battleContext!, campaignContext!]) {
      expect(context.gains[MIXER_GAIN_COUNT]!.connections).toEqual([context.gains[2]]);
    }
    const ambientLevel = battleContext!.gains[MIXER_GAIN_COUNT + SCORE_GAIN_COUNT]!;
    expect(ambientLevel.connections).toEqual([battleContext!.gains[1]]);
    const counts = FakeContext.instances.map((context) => [context.sources.length, context.gains.length]);
    writeAudioPreferences({ music: 0, effects: 0.3, interface: 0.8 });
    for (const context of FakeContext.instances) {
      expect(context.gains[2]!.gain.value).toBe(0);
      expect(context.gains[1]!.gain.value).toBe(0.3);
      expect(context.gains[3]!.gain.value).toBe(0.8);
    }
    expect(battle.toggleMuted()).toBe(true);
    expect(strategic.muted).toBe(true);
    expect(FakeContext.instances.every((context) => context.gains[0]!.gain.value === 0)).toBe(true);
    expect(strategic.toggleMuted()).toBe(false);
    expect(battle.muted).toBe(false);
    expect(FakeContext.instances.map((context) => [context.sources.length, context.gains.length]))
      .toEqual(counts);
    expect(FakeContext.instances.flatMap((context) => context.sources)
      .every((source) => source.starts.length === 1)).toBe(true);
    lease.release();
  });

  it('unsubscribes a closed graph before its bounded close fade completes', () => {
    const { graph, context } = graphHarness();
    graph.close(SCORE_CLOSE_DELAY_MS);
    const automation = context.gains.map((node) => node.gain.automation.length);
    writeAudioPreferences({ master: 0.2, effects: 0.1 });
    expect(context.gains.map((node) => node.gain.automation.length)).toEqual(automation);
    expect(graph.begin({ level: 1, distance: null })).toBeNull();
    vi.advanceTimersByTime(SCORE_CLOSE_DELAY_MS);
    expect(context.closeCalls).toBe(1);
    graph.close();
    expect(context.closeCalls).toBe(1);
  });
});
