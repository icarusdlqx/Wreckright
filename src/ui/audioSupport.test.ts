import { afterEach, describe, expect, it, vi } from 'vitest';
import { playerWorld } from '../../tests/support';
import { AudioDirector } from './audio';
import type { VoiceBus, VoiceFrame } from './audioGraph';
import { SCORE_SOURCE_COUNT } from './audioScore';
import { playSupportResolution, supportAudioCue } from './audioSupport';

class FakeParam {
  value = 0;

  setValueAtTime(value: number): void {
    this.value = value;
  }

  exponentialRampToValueAtTime(value: number): void {
    this.value = value;
  }

  setTargetAtTime(value: number): void {
    this.value = value;
  }

  cancelScheduledValues(): void {}
}

class FakeNode {
  connect<T>(destination: T): T {
    return destination;
  }
}

class FakeSource extends FakeNode {
  readonly starts: number[] = [];
  readonly stops: number[] = [];

  start(when = 0): void {
    this.starts.push(when);
  }

  stop(when = 0): void {
    this.stops.push(when);
  }
}

class FakeOscillator extends FakeSource {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeParam();
}

class FakeBufferSource extends FakeSource {
  buffer: AudioBuffer | null = null;
  loop = false;
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

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

  readonly currentTime = 5;
  readonly sampleRate = 8;
  readonly destination = new FakeNode() as unknown as AudioDestinationNode;
  readonly sources: FakeSource[] = [];
  state: AudioContextState = 'running';

  constructor() {
    FakeContext.instances.push(this);
  }

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
    return new FakeGain() as unknown as GainNode;
  }

  createBiquadFilter(): BiquadFilterNode {
    return new FakeFilter() as unknown as BiquadFilterNode;
  }

  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }

  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
}

function harness(): { context: FakeContext; frame: VoiceFrame } {
  const context = new FakeContext();
  const frame: VoiceFrame = {
    context: context as unknown as AudioContext,
    noise: {} as AudioBuffer,
    now: context.currentTime,
    out: context.createGain(),
    random: () => 0.25,
  };
  return { context, frame };
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeContext.instances.length = 0;
});

describe('support audio voices', () => {
  it('gives each supported call one admitted, finite voice', () => {
    expect(['sensor_probe', 'air_strike', 'repair_truck'].map(supportAudioCue)).toEqual([
      'probe',
      'air',
      'repair',
    ]);
    expect(supportAudioCue('artillery_strike')).toBeNull();

    const { context, frame } = harness();
    const begin = vi.fn(() => frame);
    const bus: VoiceBus = { begin };
    for (const call of ['sensor_probe', 'air_strike', 'repair_truck']) {
      playSupportResolution(bus, call, { level: 0.8, distance: 40 });
    }
    playSupportResolution(bus, 'artillery_strike', { level: 0.8, distance: 40 });

    expect(begin).toHaveBeenCalledTimes(3);
    expect(context.sources).toHaveLength(9);
    expect(context.sources.every((source) => source.stops.length === 1)).toBe(true);
    expect(context.sources.every((source) => Number.isFinite(source.stops[0]))).toBe(true);
  });

  it('routes resolved player support and ignores an enemy call', () => {
    vi.stubGlobal('AudioContext', FakeContext as unknown as typeof AudioContext);
    const world = playerWorld('audio-support');
    const audio = new AudioDirector();
    audio.unlock();
    audio.listenAt = { x: 200, y: 200 };
    const player = world.playerTeam ?? 0;

    audio.consume(world, [
      { type: 'support_resolved', tick: world.tick, team: player, call: 'sensor_probe', x: 200, y: 200 },
      { type: 'support_resolved', tick: world.tick, team: player, call: 'air_strike', x: 200, y: 200 },
      { type: 'support_resolved', tick: world.tick, team: player, call: 'repair_truck', x: 200, y: 200 },
      { type: 'support_resolved', tick: world.tick, team: 1 - player, call: 'sensor_probe', x: 200, y: 200 },
    ]);

    expect(FakeContext.instances.at(-1)?.sources).toHaveLength(SCORE_SOURCE_COUNT + 9);
    audio.destroy();
  });
});
