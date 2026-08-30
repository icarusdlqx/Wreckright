import type { AmbientBus } from './audioGraph';
import { scoreVoicingAt, type ScoreVoicing } from './audioScoreVoicing';

export const SCORE_SOURCE_COUNT = 5;
export const SCORE_GAIN_COUNT = 9;
export const SCORE_FILTER_COUNT = 3;
export const SCORE_NODE_COUNT = SCORE_SOURCE_COUNT + SCORE_GAIN_COUNT + SCORE_FILTER_COUNT;
export const SCORE_RETARGET_INTERVAL_SECONDS = 0.125;
export const SCORE_CLOSE_DELAY_MS = 120;

export const SCORE_LEVEL = 0.052;
const ATTACK_SECONDS = 0.6;
const RELEASE_SECONDS = 1.6;
const FULL_ATTACK_SECONDS = 0.35;
const FULL_RELEASE_SECONDS = 2.2;
const CULTURE_MORPH_SECONDS = 0.75;
const TREATMENT_MORPH_SECONDS = 1.2;
const STOP_TIME_CONSTANT_SECONDS = 0.02;
const SOURCE_STOP_SECONDS = 0.1;
const STATE_EPSILON = 0.0001;

export interface ScoreState {
  intensity: number;
  /** Null retains the most recent presentable culture mix. */
  aurelianShare: number | null;
  /** Route treatment trim; omitted battle updates stay at full score level. */
  level?: number;
}

export interface ScoreHandle {
  setState(state: Readonly<ScoreState>, playbackSpeed?: number): void;
  stop(): void;
}

export type ScoreBus = Pick<AmbientBus, 'context' | 'master'>;

/**
 * Builds one fixed score graph. Culture and pressure only automate the nodes
 * allocated here; consuming world updates can never add another source.
 */
export function createProceduralScore(
  bus: ScoreBus,
  initialAurelianShare: number | null = 0,
  initialLevel = 1,
): ScoreHandle {
  const now = bus.context.currentTime;
  const linewrought = scoreVoicingAt(0);
  const aurelian = scoreVoicingAt(1);
  const initialShare = optionalShare(initialAurelianShare) ?? 0;
  const initialVoicing = scoreVoicingAt(initialShare);

  const scoreLevel = bus.context.createGain();
  scoreLevel.gain.value = 0;
  scoreLevel.connect(bus.master);

  const droneLayer = bus.context.createGain();
  droneLayer.gain.value = 0;
  droneLayer.connect(scoreLevel);
  const droneFilter = bus.context.createBiquadFilter();
  droneFilter.type = 'lowpass';
  setFilterInitial(droneFilter, initialVoicing.droneCutoffHz, initialVoicing.droneQ);
  droneFilter.connect(droneLayer);

  const root = bus.context.createOscillator();
  root.type = 'triangle';
  root.frequency.value = initialVoicing.rootHz;
  const rootLevel = bus.context.createGain();
  rootLevel.gain.value = initialVoicing.rootLevel;
  root.connect(rootLevel).connect(droneFilter);

  const fifth = bus.context.createOscillator();
  fifth.type = 'sine';
  fifth.frequency.value = initialVoicing.fifthHz;
  const fifthLevel = bus.context.createGain();
  fifthLevel.gain.value = initialVoicing.fifthLevel;
  fifth.connect(fifthLevel).connect(droneFilter);

  const pulseLayer = bus.context.createGain();
  pulseLayer.gain.value = pulseLayerLevel(0);
  pulseLayer.connect(scoreLevel);
  const pulseFilter = bus.context.createBiquadFilter();
  pulseFilter.type = 'lowpass';
  setFilterInitial(pulseFilter, initialVoicing.pulseCutoffHz, initialVoicing.pulseQ);
  pulseFilter.connect(pulseLayer);

  const pulseGate = bus.context.createGain();
  pulseGate.gain.value = 0.5;
  pulseGate.connect(pulseFilter);
  const pulse = bus.context.createOscillator();
  pulse.type = 'triangle';
  pulse.frequency.value = initialVoicing.pulseHz;
  const pulseVoiceLevel = bus.context.createGain();
  pulseVoiceLevel.gain.value = initialVoicing.pulseLevel;
  pulse.connect(pulseVoiceLevel).connect(pulseGate);

  const pulseLfo = bus.context.createOscillator();
  pulseLfo.type = 'sine';
  pulseLfo.frequency.value = pulseRate(0);
  const pulseDepth = bus.context.createGain();
  pulseDepth.gain.value = 0.44;
  pulseLfo.connect(pulseDepth);
  pulseDepth.connect(pulseGate.gain);

  const fullLayer = bus.context.createGain();
  fullLayer.gain.value = fullLayerLevel(0);
  fullLayer.connect(scoreLevel);
  const fullFilter = bus.context.createBiquadFilter();
  fullFilter.type = 'lowpass';
  setFilterInitial(fullFilter, initialVoicing.fullCutoffHz, initialVoicing.fullQ);
  fullFilter.connect(fullLayer);
  const fullColour = bus.context.createOscillator();
  fullColour.type = 'sawtooth';
  fullColour.frequency.value = initialVoicing.fullHz;
  fullColour.connect(fullFilter);

  const startingLevel = clamp01(Number.isFinite(initialLevel) ? initialLevel : 1);
  retarget(scoreLevel.gain, SCORE_LEVEL * startingLevel, now, TREATMENT_MORPH_SECONDS);
  retarget(droneLayer.gain, droneLayerLevel(0), now, 1.2);

  const sources: OscillatorNode[] = [root, fifth, pulse, pulseLfo, fullColour];
  for (const source of sources) source.start(now);

  let stopped = false;
  let pendingIntensity = 0;
  let pendingShare = initialShare;
  let pendingLevel = startingLevel;
  let appliedIntensity = 0;
  let appliedShare = initialShare;
  let appliedLevel = startingLevel;
  let lastRetargetAt = Number.NEGATIVE_INFINITY;

  return {
    setState: (state: Readonly<ScoreState>, playbackSpeed = 1): void => {
      if (stopped) return;
      pendingIntensity = clamp01(Number.isFinite(state.intensity) ? state.intensity : 0);
      pendingShare = optionalShare(state.aurelianShare) ?? pendingShare;
      pendingLevel = clamp01(Number.isFinite(state.level) ? state.level ?? 1 : 1);

      const at = bus.context.currentTime;
      const elapsed = at - lastRetargetAt;
      if (elapsed >= 0 && elapsed < SCORE_RETARGET_INTERVAL_SECONDS) return;

      const intensityChanged = Math.abs(pendingIntensity - appliedIntensity) >= STATE_EPSILON;
      const cultureChanged = Math.abs(pendingShare - appliedShare) >= STATE_EPSILON;
      const levelChanged = Math.abs(pendingLevel - appliedLevel) >= STATE_EPSILON;
      if (!intensityChanged && !cultureChanged && !levelChanged) return;

      const speed = sanitiseSpeed(playbackSpeed);
      if (intensityChanged) {
        const layerSeconds = (
          pendingIntensity >= appliedIntensity ? ATTACK_SECONDS : RELEASE_SECONDS
        ) / speed;
        const fullSeconds = (
          pendingIntensity >= appliedIntensity ? FULL_ATTACK_SECONDS : FULL_RELEASE_SECONDS
        ) / speed;
        retarget(droneLayer.gain, droneLayerLevel(pendingIntensity), at, layerSeconds);
        retarget(pulseLayer.gain, pulseLayerLevel(pendingIntensity), at, layerSeconds);
        retarget(pulseLfo.frequency, pulseRate(pendingIntensity), at, layerSeconds);
        retarget(fullLayer.gain, fullLayerLevel(pendingIntensity), at, fullSeconds);
        appliedIntensity = pendingIntensity;
      }
      if (cultureChanged) {
        const seconds = CULTURE_MORPH_SECONDS / speed;
        retargetCulture(
          pendingShare,
          linewrought,
          aurelian,
          root,
          fifth,
          pulse,
          fullColour,
          rootLevel,
          fifthLevel,
          pulseVoiceLevel,
          droneFilter,
          pulseFilter,
          fullFilter,
          at,
          seconds,
        );
        appliedShare = pendingShare;
      }
      if (levelChanged) {
        retarget(
          scoreLevel.gain,
          SCORE_LEVEL * pendingLevel,
          at,
          TREATMENT_MORPH_SECONDS / speed,
        );
        appliedLevel = pendingLevel;
      }
      lastRetargetAt = at;
    },
    stop: (): void => {
      if (stopped) return;
      stopped = true;
      const at = bus.context.currentTime;
      retarget(scoreLevel.gain, 0, at, STOP_TIME_CONSTANT_SECONDS);
      for (const source of sources) {
        try {
          source.stop(at + SOURCE_STOP_SECONDS);
        } catch {
          // Closing the shared context has already ended this finite lifetime.
        }
      }
    },
  };
}

export const startBattleScore = createProceduralScore;

/** The high-pressure colour layer stays silent until the battle is committed. */
export function fullLayerLevel(rawIntensity: number): number {
  const intensity = clamp01(Number.isFinite(rawIntensity) ? rawIntensity : 0);
  return smoothstep(0.46, 0.74, intensity) * (0.035 + 0.075 * intensity);
}

function retargetCulture(
  share: number,
  linewrought: Readonly<ScoreVoicing>,
  aurelian: Readonly<ScoreVoicing>,
  root: OscillatorNode,
  fifth: OscillatorNode,
  pulse: OscillatorNode,
  full: OscillatorNode,
  rootLevel: GainNode,
  fifthLevel: GainNode,
  pulseLevel: GainNode,
  droneFilter: BiquadFilterNode,
  pulseFilter: BiquadFilterNode,
  fullFilter: BiquadFilterNode,
  at: number,
  seconds: number,
): void {
  retarget(root.frequency, geometric(linewrought.rootHz, aurelian.rootHz, share), at, seconds);
  retarget(fifth.frequency, geometric(linewrought.fifthHz, aurelian.fifthHz, share), at, seconds);
  retarget(pulse.frequency, geometric(linewrought.pulseHz, aurelian.pulseHz, share), at, seconds);
  retarget(full.frequency, geometric(linewrought.fullHz, aurelian.fullHz, share), at, seconds);
  retarget(rootLevel.gain, linear(linewrought.rootLevel, aurelian.rootLevel, share), at, seconds);
  retarget(fifthLevel.gain, linear(linewrought.fifthLevel, aurelian.fifthLevel, share), at, seconds);
  retarget(pulseLevel.gain, linear(linewrought.pulseLevel, aurelian.pulseLevel, share), at, seconds);
  retargetFilter(
    droneFilter,
    linewrought.droneCutoffHz,
    aurelian.droneCutoffHz,
    linewrought.droneQ,
    aurelian.droneQ,
    share,
    at,
    seconds,
  );
  retargetFilter(
    pulseFilter,
    linewrought.pulseCutoffHz,
    aurelian.pulseCutoffHz,
    linewrought.pulseQ,
    aurelian.pulseQ,
    share,
    at,
    seconds,
  );
  retargetFilter(
    fullFilter,
    linewrought.fullCutoffHz,
    aurelian.fullCutoffHz,
    linewrought.fullQ,
    aurelian.fullQ,
    share,
    at,
    seconds,
  );
}

function retargetFilter(
  filter: BiquadFilterNode,
  fromCutoffHz: number,
  toCutoffHz: number,
  fromQ: number,
  toQ: number,
  share: number,
  at: number,
  seconds: number,
): void {
  retarget(filter.frequency, geometric(fromCutoffHz, toCutoffHz, share), at, seconds);
  retarget(filter.Q, linear(fromQ, toQ, share), at, seconds);
}

function setFilterInitial(filter: BiquadFilterNode, cutoffHz: number, q: number): void {
  filter.frequency.value = cutoffHz;
  filter.Q.value = q;
}

function droneLayerLevel(intensity: number): number {
  return 0.58 + intensity * 0.22;
}

function pulseLayerLevel(intensity: number): number {
  const mix = smoothstep(0.14, 0.52, intensity);
  return mix * (0.32 + intensity * 0.46);
}

function pulseRate(intensity: number): number {
  return 0.72 + intensity * 1.45;
}

function retarget(param: AudioParam, value: number, at: number, seconds: number): void {
  param.cancelScheduledValues(at);
  param.setTargetAtTime(value, at, Math.max(0.01, seconds));
}

function optionalShare(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? clamp01(value) : null;
}

function sanitiseSpeed(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.min(4, Math.max(0.25, value)) : 1;
}

function geometric(from: number, to: number, share: number): number {
  return from * (to / from) ** share;
}

function linear(from: number, to: number, share: number): number {
  return from + (to - from) * share;
}

function smoothstep(from: number, to: number, value: number): number {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
