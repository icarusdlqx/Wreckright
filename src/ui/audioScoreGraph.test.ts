import { afterEach, describe, expect, it, vi } from 'vitest';
import { playerWorld } from '../../tests/support';
import type { SimEvent } from '../sim/events';
import type { MechEntity, World } from '../sim/types';
import { AudioDirector } from './audio';
import { PENDING_AUDIO_CLOSE_LIMIT, type AmbientBus } from './audioGraph';
import {
  SCORE_CLOSE_DELAY_MS,
  SCORE_RETARGET_INTERVAL_SECONDS,
  SCORE_SOURCE_COUNT,
  startBattleScore,
} from './audioScore';

interface TargetCall { value: number; at: number; timeConstant: number }
type AutomationCall =
  | { method: 'cancel'; at: number }
  | ({ method: 'target' } & TargetCall);

class FakeParam {
  value = 0;
  readonly cancelledAt: number[] = [];
  readonly targets: TargetCall[] = [];
  readonly automation: AutomationCall[] = [];
  setValueAtTime(value: number): void { this.value = value; }
  linearRampToValueAtTime(value: number): void { this.value = value; }
  exponentialRampToValueAtTime(value: number): void { this.value = value; }
  setTargetAtTime(value: number, at: number, timeConstant: number): void {
    this.value = value;
    this.targets.push({ value, at, timeConstant });
    this.automation.push({ method: 'target', value, at, timeConstant });
  }
  cancelScheduledValues(at: number): void {
    this.cancelledAt.push(at);
    this.automation.push({ method: 'cancel', at });
  }
}

class FakeNode {
  connect<T>(destination: T): T { return destination; }
}

class FakeSource extends FakeNode {
  readonly starts: number[] = [];
  readonly stops: number[] = [];
  start(when = 0): void { this.starts.push(when); }
  stop(when = 0): void { this.stops.push(when); }
}

class FakeOscillator extends FakeSource {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeParam();
}

class FakeBufferSource extends FakeSource {
  buffer: AudioBuffer | null = null;
  loop = false;
}

class FakeGain extends FakeNode { readonly gain = new FakeParam(); }

class FakeFilter extends FakeNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
}

class FakeCompressor extends FakeNode {
  readonly threshold = new FakeParam();
  readonly ratio = new FakeParam();
}

class FakeContext {
  static readonly instances: FakeContext[] = [];
  currentTime = 5;
  readonly sampleRate = 8;
  readonly destination = new FakeNode() as unknown as AudioDestinationNode;
  readonly sources: FakeSource[] = [];
  readonly gains: FakeGain[] = [];
  readonly filters: FakeFilter[] = [];
  closeCalls = 0;
  state: AudioContextState = 'running';

  constructor() { FakeContext.instances.push(this); }
  createDynamicsCompressor(): DynamicsCompressorNode {
    return new FakeCompressor() as unknown as DynamicsCompressorNode;
  }
  createBuffer(_channels: number, length: number): AudioBuffer {
    const data = new Float32Array(length);
    return { getChannelData: () => data } as unknown as AudioBuffer;
  }
  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeBufferSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
  createOscillator(): OscillatorNode {
    const source = new FakeOscillator();
    this.sources.push(source);
    return source as unknown as OscillatorNode;
  }
  createGain(): GainNode {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }
  createBiquadFilter(): BiquadFilterNode {
    const filter = new FakeFilter();
    this.filters.push(filter);
    return filter as unknown as BiquadFilterNode;
  }
  close(): Promise<void> {
    this.closeCalls += 1;
    this.state = 'closed';
    return Promise.resolve();
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
}

function scoreHarness(): { context: FakeContext; handle: ReturnType<typeof startBattleScore> } {
  const context = new FakeContext();
  const bus: AmbientBus = {
    context: context as unknown as AudioContext,
    master: context.createGain(),
    noise: {} as AudioBuffer,
    random: () => 0.25,
  };
  return { context, handle: startBattleScore(bus) };
}

function automatedParams(context: FakeContext, at: number): FakeParam[] {
  const gainParams = context.gains.map((gain) => gain.gain);
  const frequencyParams = context.sources
    .filter((source): source is FakeOscillator => source instanceof FakeOscillator)
    .map((source) => source.frequency);
  return [...gainParams, ...frequencyParams]
    .filter((param) => param.automation.some((call) => call.at === at));
}

function expectRetarget(context: FakeContext, at: number, seconds: number): void {
  const params = automatedParams(context, at);
  expect(params).toHaveLength(3);
  for (const param of params) {
    const calls = param.automation.filter((call) => call.at === at);
    expect(calls.map((call) => call.method)).toEqual(['cancel', 'target']);
    const target = calls[1];
    expect(target?.method).toBe('target');
    if (target?.method === 'target') expect(target.timeConstant).toBeCloseTo(seconds, 8);
  }
}

function retargetSeconds(context: FakeContext, at: number): number {
  const params = automatedParams(context, at);
  expect(params).toHaveLength(3);
  const seconds = new Set<number>();
  for (const param of params) {
    const calls = param.automation.filter((call) => call.at === at);
    expect(calls.map((call) => call.method)).toEqual(['cancel', 'target']);
    const target = calls[1];
    expect(target?.method).toBe('target');
    if (target?.method === 'target') seconds.add(target.timeConstant);
  }
  expect(seconds.size).toBe(1);
  return [...seconds][0] ?? Number.NaN;
}

function quietWorld(seed: string): World {
  const world = playerWorld(seed);
  for (const entity of world.entities) entity.motion = 'stationary';
  world.vision?.visible.clear();
  world.vision?.detected.clear();
  return world;
}

function teams(world: World): { ally: MechEntity; enemy: MechEntity } {
  const ally = world.entities.find((entity) => entity.team === world.playerTeam);
  const enemy = world.entities.find((entity) => entity.team !== world.playerTeam);
  if (ally === undefined || enemy === undefined) throw new Error('score test needs two teams');
  return { ally, enemy };
}

function fired(world: World, shooter: MechEntity): Extract<SimEvent, { type: 'weapon_fired' }> {
  const { ally, enemy } = teams(world);
  const target = shooter.team === ally.team ? enemy : ally;
  const weapon = shooter.weapons.find((mount) => world.catalog.weapons.has(mount.weaponId));
  if (weapon === undefined) throw new Error('score test needs an armed unit');
  return {
    type: 'weapon_fired', tick: world.tick, shooterId: shooter.id,
    targetId: target.id, weaponId: weapon.weaponId,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeContext.instances.length = 0;
});

describe('score graph', () => {
  it('owns four fixed sources and retargets them without allocating', () => {
    const { context, handle } = scoreHarness();
    expect(context.sources).toHaveLength(SCORE_SOURCE_COUNT);
    expect(context.sources.every((source) => source.starts.length === 1)).toBe(true);
    expect(context.sources.every((source) => source.stops.length === 0)).toBe(true);
    const counts = [context.sources.length, context.gains.length, context.filters.length];
    for (let step = 0; step < 100; step += 1) {
      context.currentTime = 5 + step / 10;
      handle.setIntensity((step % 11) / 10, step % 3 === 0 ? 4 : 1);
    }
    expect([context.sources.length, context.gains.length, context.filters.length]).toEqual(counts);
  });

  it('schedules attack and release from absolute audio time without cuts', () => {
    const { context, handle } = scoreHarness();
    context.currentTime = 12.75;
    handle.setIntensity(0.8, 1);
    expectRetarget(context, 12.75, 0.6);

    context.currentTime = 17.25;
    handle.setIntensity(0.1, 1);
    expectRetarget(context, 17.25, 1.6);

    context.currentTime = 21.5;
    handle.setIntensity(0.9, 4);
    expectRetarget(context, 21.5, 0.6 / 4);

    context.currentTime = 24.75;
    handle.setIntensity(0.05, 4);
    expectRetarget(context, 24.75, 1.6 / 4);
  });

  it('bounds a long 20 Hz intensity stream by the retarget cadence', () => {
    const { context, handle } = scoreHarness();
    const start = 10;
    const seconds = 120;
    const ticksPerSecond = 20;
    for (let tick = 0; tick < seconds * ticksPerSecond; tick += 1) {
      context.currentTime = start + tick / ticksPerSecond;
      handle.setIntensity(tick % 2 === 0 ? 0.18 : 0.82);
    }

    const retargetTimes = new Set(
      context.gains
        .flatMap((gain) => gain.gain.targets)
        .filter((target) => target.at >= start)
        .map((target) => target.at),
    );
    expect(retargetTimes.size).toBeGreaterThan(1);
    expect(retargetTimes.size).toBeLessThanOrEqual(
      Math.ceil(seconds / SCORE_RETARGET_INTERVAL_SECONDS) + 1,
    );
    const scheduledSeconds = [...retargetTimes].map((at) => retargetSeconds(context, at));
    expect(scheduledSeconds).toContain(0.6);
    expect(scheduledSeconds).toContain(1.6);
    expect(scheduledSeconds.every((value) => value === 0.6 || value === 1.6)).toBe(true);
  });

  it('stops every persistent source exactly once', () => {
    const { context, handle } = scoreHarness();
    context.currentTime = 23;
    handle.stop();
    handle.stop();
    expect(context.sources).toHaveLength(SCORE_SOURCE_COUNT);
    expect(context.sources.every((source) => source.stops.length === 1)).toBe(true);
    expect(context.sources.every((source) => Number.isFinite(source.stops[0]))).toBe(true);
  });
});

describe('score lifetime in the audio director', () => {
  it('drops pre-unlock pressure but keeps an unlocked arc current while muted', () => {
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', FakeContext as unknown as typeof AudioContext);
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    const world = quietWorld('score-mute');
    const audio = new AudioDirector();
    const event = fired(world, teams(world).ally);
    audio.consume(world, Array.from({ length: 8 }, () => ({ ...event })));
    audio.unlock();
    const context = FakeContext.instances.at(-1);
    if (context === undefined) throw new Error('score test needs an audio context');
    const master = context.gains[0];
    if (master === undefined) throw new Error('score test needs the master gain');
    const sourceCount = context.sources.length;
    const targetsBefore = context.gains.flatMap((gain) => gain.gain.targets).length;
    audio.consume(world, []);
    expect(context.gains.flatMap((gain) => gain.gain.targets)).toHaveLength(targetsBefore);

    expect(audio.toggleMuted()).toBe(true);
    expect(master.gain.value).toBe(0);
    audio.consume(world, Array.from({ length: 8 }, () => ({ ...event })));
    expect(context.sources).toHaveLength(sourceCount);
    expect(context.gains.flatMap((gain) => gain.gain.targets).length).toBeGreaterThan(targetsBefore);
    expect(audio.toggleMuted()).toBe(false);
    expect(master.gain.value).toBe(0.5);
    expect(context.sources).toHaveLength(sourceCount);
    audio.destroy();
    vi.advanceTimersByTime(SCORE_CLOSE_DELAY_MS);
    expect(context.closeCalls).toBe(1);
  });

  it('closes every context and stops every persistent source across ten battles', () => {
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', FakeContext as unknown as typeof AudioContext);
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    for (let battle = 0; battle < 10; battle += 1) {
      const audio = new AudioDirector();
      audio.unlock();
      const context = FakeContext.instances.at(-1);
      if (context === undefined) throw new Error('score test needs an audio context');
      expect(context.sources).toHaveLength(SCORE_SOURCE_COUNT);
      audio.destroy();
      audio.destroy();
      expect(context.closeCalls).toBe(0);
      expect(context.sources.every((source) => source.stops.length === 1)).toBe(true);
      vi.advanceTimersByTime(SCORE_CLOSE_DELAY_MS);
      expect(context.closeCalls).toBe(1);
    }
    expect(FakeContext.instances).toHaveLength(10);
    expect(FakeContext.instances.flatMap((context) => context.sources)).toHaveLength(
      10 * SCORE_SOURCE_COUNT,
    );
    for (const context of FakeContext.instances) {
      expect(context.closeCalls).toBe(1);
      expect(context.state).toBe('closed');
      expect(context.sources.every((source) => source.starts.length === 1)).toBe(true);
      expect(context.sources.every((source) => source.stops.length === 1)).toBe(true);
      expect(context.sources.every((source) => Number.isFinite(source.stops[0]))).toBe(true);
    }
  });

  it('bounds open contexts during a ten-battle restart storm', () => {
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', FakeContext as unknown as typeof AudioContext);
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    for (let battle = 0; battle < 10; battle += 1) {
      const audio = new AudioDirector();
      audio.unlock();
      audio.destroy();
    }

    expect(FakeContext.instances).toHaveLength(10);
    expect(FakeContext.instances.filter((context) => context.state !== 'closed')).toHaveLength(
      PENDING_AUDIO_CLOSE_LIMIT,
    );
    expect(FakeContext.instances.every(
      (context) => context.sources.every((source) => source.stops.length === 1),
    )).toBe(true);

    vi.advanceTimersByTime(SCORE_CLOSE_DELAY_MS);
    expect(FakeContext.instances.every(
      (context) => context.state === 'closed' && context.closeCalls === 1,
    )).toBe(true);
  });
});
