import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import type { SimEvent } from '../sim/events';
import { AudioDirector } from './audio';
import { AudioGraph } from './audioGraph';

class FakeParam {
  value = 0;

  setValueAtTime(value: number): void {
    this.value = value;
  }

  exponentialRampToValueAtTime(value: number): void {
    this.value = value;
  }
}

class FakeNode {
  connect<T>(destination: T): T {
    return destination;
  }
}

class FakeSource extends FakeNode {
  buffer: AudioBuffer | null = null;
  readonly frequency = new FakeParam();
  readonly starts: number[] = [];

  start(when = 0): void {
    this.starts.push(when);
  }

  stop(): void {}
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakeFilter extends FakeNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
}

class FakeContext {
  readonly currentTime = 5;
  readonly sources: FakeSource[] = [];

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  createOscillator(): OscillatorNode {
    const source = new FakeSource();
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
    return Promise.resolve();
  }
}

type Fired = Extract<SimEvent, { type: 'weapon_fired' }>;

function sourceCount(modeId: 'cluster' | 'slug' | undefined): number {
  const context = new FakeContext();
  const graph = new AudioGraph(
    context as unknown as AudioContext,
    context.createGain(),
    {} as AudioBuffer,
  );
  const audio = new AudioDirector();
  (audio as unknown as { graph: AudioGraph }).graph = graph;
  const world = playerWorld(`audio-fire-mode-${modeId ?? 'legacy'}`);
  const shooter = world.entities.find((candidate) => candidate.team === world.playerTeam);
  const target = world.entities.find((candidate) => candidate.team !== world.playerTeam);
  if (shooter === undefined || target === undefined) {
    throw new Error('audio fire-mode test needs opposing teams');
  }
  audio.listenAt = shooter.pos;
  const fired: Fired = {
    type: 'weapon_fired',
    tick: world.tick,
    shooterId: shooter.id,
    targetId: target.id,
    weaponId: 'lbx_ac10',
    ...(modeId === undefined ? {} : { modeId }),
  };

  audio.consume(world, [fired]);
  const count = context.sources.length;
  audio.destroy();
  return count;
}

describe('fire-mode audio', () => {
  it('voices the event mode projectile count through the audio director', () => {
    expect(sourceCount('cluster')).toBe(15);
    expect(sourceCount('slug')).toBe(3);
    expect(sourceCount(undefined)).toBe(15);
  });
});
