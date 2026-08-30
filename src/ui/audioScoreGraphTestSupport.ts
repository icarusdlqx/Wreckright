import { playerWorld, spawnDesign } from '../../tests/support';
import type { SimEvent } from '../sim/events';
import type { MechEntity, World } from '../sim/types';
import type { AmbientBus } from './audioGraph';
import { SCORE_GAIN_COUNT, startBattleScore } from './audioScoreGraph';

export interface TargetCall {
  value: number;
  at: number;
  timeConstant: number;
}

export type AutomationCall =
  | { method: 'cancel'; at: number }
  | ({ method: 'target' } & TargetCall);

export class FakeParam {
  value = 0;
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
    this.automation.push({ method: 'cancel', at });
  }
}

export class FakeNode {
  connect<T>(destination: T): T { return destination; }
}

export class FakeSource extends FakeNode {
  readonly starts: number[] = [];
  readonly stops: number[] = [];

  start(when = 0): void { this.starts.push(when); }
  stop(when = 0): void { this.stops.push(when); }
}

export class FakeOscillator extends FakeSource {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeParam();
}

class FakeBufferSource extends FakeSource {
  buffer: AudioBuffer | null = null;
  loop = false;
}

export class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

export class FakeFilter extends FakeNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
}

class FakeCompressor extends FakeNode {
  readonly threshold = new FakeParam();
  readonly ratio = new FakeParam();
}

export class FakeContext {
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

export function scoreHarness(initialShare: number | null = 0, initialLevel = 1): {
  context: FakeContext;
  handle: ReturnType<typeof startBattleScore>;
} {
  const context = new FakeContext();
  const bus: AmbientBus = {
    context: context as unknown as AudioContext,
    master: new FakeGain() as unknown as GainNode,
    noise: {} as AudioBuffer,
    random: () => 0.25,
  };
  return { context, handle: startBattleScore(bus, initialShare, initialLevel) };
}

export interface ScoreParams {
  readonly level: FakeParam;
  readonly intensity: FakeParam[];
  readonly full: FakeParam;
  readonly culture: FakeParam[];
}

export function scoreParams(context: FakeContext): ScoreParams {
  const gainOffset = context.gains.length - SCORE_GAIN_COUNT;
  const oscillators = context.sources.filter(
    (source): source is FakeOscillator => source instanceof FakeOscillator,
  );
  const gain = (index: number): FakeParam => required(context.gains[gainOffset + index]).gain;
  const frequency = (index: number): FakeParam => required(oscillators[index]).frequency;
  const full = gain(8);
  return {
    level: gain(0),
    intensity: [gain(1), gain(4), frequency(3), full],
    full,
    culture: [
      frequency(0), frequency(1), frequency(2), frequency(4),
      gain(2), gain(3), gain(6),
      ...context.filters.flatMap((filter) => [filter.frequency, filter.Q]),
    ],
  };
}

export function callsAt(param: FakeParam, at: number): AutomationCall[] {
  return param.automation.filter((call) => call.at === at);
}

export function targetAt(param: FakeParam, at: number): TargetCall | undefined {
  return param.targets.find((target) => target.at === at);
}

export function quietWorld(seed: string): World {
  const world = playerWorld(seed);
  for (const entity of world.entities) entity.motion = 'stationary';
  clearVision(world);
  return world;
}

export function cultureWorld(seed: string, friendly: 'linewrought' | 'aurelian'): {
  world: World;
  ally: MechEntity;
  enemy: MechEntity;
} {
  const world = playerWorld(seed);
  world.entities = [];
  clearVision(world);
  const ally = spawnDesign(world, friendly === 'aurelian' ? 'wisp_scout' : 'drover_carrier', 0);
  const enemy = spawnDesign(world, friendly === 'aurelian' ? 'drover_carrier' : 'wisp_scout', 1);
  return { world, ally, enemy };
}

export function fired(
  world: World,
  shooter: MechEntity,
  target: MechEntity,
): Extract<SimEvent, { type: 'weapon_fired' }> {
  const weapon = shooter.weapons.find((mount) => world.catalog.weapons.has(mount.weaponId));
  if (weapon === undefined) throw new Error('score test needs an armed unit');
  return {
    type: 'weapon_fired', tick: world.tick, shooterId: shooter.id,
    targetId: target.id, weaponId: weapon.weaponId,
  };
}

export function sensorDetect(world: World, hostile: MechEntity): void {
  const vision = world.vision;
  if (vision === null) throw new Error('score test needs player vision');
  vision.detected.add(hostile.id);
  vision.tracks.set(hostile.id, {
    id: hostile.id,
    team: hostile.team,
    frame: hostile.frame,
    chassisClass: hostile.chassisClass,
    pos: { ...hostile.pos },
    tick: world.tick,
    source: 'sensor',
  });
}

function clearVision(world: World): void {
  world.vision?.visible.clear();
  world.vision?.identified.clear();
  world.vision?.detected.clear();
  world.vision?.tracks.clear();
  world.vision?.observedHulks.clear();
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('incomplete fake score graph');
  return value;
}
