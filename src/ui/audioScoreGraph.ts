import type { AmbientBus } from './audioGraph';
import { loadScoreBuffers, SCORE_LOOP_SECONDS, type ScoreBufferLoader } from './audioScoreAssets';
import { scoreCultureAt } from './audioScoreVoicing';

export const SCORE_SOURCE_COUNT = 3;
export const SCORE_GAIN_COUNT = 5;
export const SCORE_FILTER_COUNT = 0;
export const SCORE_NODE_COUNT = SCORE_SOURCE_COUNT + SCORE_GAIN_COUNT;
export const SCORE_RETARGET_INTERVAL_SECONDS = 0.125;
export const SCORE_CLOSE_DELAY_MS = 120;
export const SCORE_LEVEL = 0.8;
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
  /** Settles on start, terminal load failure, or cancellation; never rejects. */
  readonly ready: Promise<boolean>;
  setState(state: Readonly<ScoreState>, playbackSpeed?: number): void;
  stop(): void;
}

export type ScoreBus = Pick<AmbientBus, 'context' | 'master'>;

/** One phase-aligned arrangement. State updates only automate its fixed gains. */
export function createAuthoredScore(
  bus: ScoreBus,
  initialAurelianShare: number | null = 0,
  initialLevel = 1,
  loader: ScoreBufferLoader = loadScoreBuffers,
): ScoreHandle {
  const context = bus.context;
  const gains = Array.from({ length: SCORE_GAIN_COUNT }, () => context.createGain());
  const [level, core, rhythm, ironwork, monolith] = gains as [GainNode, GainNode, GainNode, GainNode, GainNode];
  level.connect(bus.master);
  core.connect(level);
  rhythm.connect(level);
  ironwork.connect(rhythm);
  monolith.connect(rhythm);
  const sources = [core, ironwork, monolith].map((gain) => {
    const source = context.createBufferSource();
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = SCORE_LOOP_SECONDS;
    source.connect(gain);
    return source;
  });
  let pendingIntensity = 0;
  let pendingShare = optionalShare(initialAurelianShare) ?? 0;
  let pendingLevel = finiteLevel(initialLevel);
  let appliedIntensity = 0;
  let appliedShare = pendingShare;
  let appliedLevel = pendingLevel;
  let lastRetargetAt = Number.NEGATIVE_INFINITY;
  let stopped = false;
  let started = false;
  const startedSources = new Set<AudioBufferSourceNode>();
  let released = false;
  let retry: ReturnType<typeof setTimeout> | null = null;
  const controller = new AbortController();
  let resolveReady: (started: boolean) => void = () => undefined;
  const ready = new Promise<boolean>((resolve) => { resolveReady = resolve; });
  const initialCulture = scoreCultureAt(pendingShare);
  level.gain.value = 0;
  core.gain.value = coreLayerLevel(0);
  rhythm.gain.value = rhythmLayerLevel(0);
  ironwork.gain.value = initialCulture.ironwork;
  monolith.gain.value = initialCulture.monolith;

  const release = (): void => {
    if (released) return;
    released = true;
    for (const source of sources) {
      source.onended = null;
      source.disconnect();
      source.buffer = null;
    }
    for (const gain of gains) gain.disconnect();
  };

  const load = async (attempt: number): Promise<void> => {
    try {
      const buffers = await loader(context, controller.signal);
      if (stopped || context.state === 'closed') { release(); resolveReady(false); return; }
      const at = context.currentTime + 0.025;
      sources.forEach((source, index) => { source.buffer = buffers[index] ?? null; });
      // Loading may outlast many world updates. Begin with their newest mix,
      // then fade the shared master; never replay an obsolete initial state.
      const culture = scoreCultureAt(pendingShare);
      core.gain.value = coreLayerLevel(pendingIntensity);
      rhythm.gain.value = rhythmLayerLevel(pendingIntensity);
      ironwork.gain.value = culture.ironwork;
      monolith.gain.value = culture.monolith;
      appliedIntensity = pendingIntensity;
      appliedShare = pendingShare;
      appliedLevel = pendingLevel;
      level.gain.setValueAtTime(0, at);
      retarget(level.gain, SCORE_LEVEL * pendingLevel, at, 1.2);
      for (const source of sources) { source.start(at); startedSources.add(source); }
      started = true;
      resolveReady(true);
    } catch {
      if (stopped || context.state === 'closed') { release(); resolveReady(false); return; }
      if (attempt === 0 && startedSources.size === 0) {
        retry = setTimeout(() => { retry = null; void load(1); }, 1_000);
      } else {
        stopped = true;
        controller.abort();
        for (const source of startedSources) { try { source.stop(); } catch { /* Context already closed. */ } }
        release();
        resolveReady(false);
      }
    }
  };
  void load(0);

  return {
    ready,
    setState: (state, playbackSpeed = 1): void => {
      if (stopped) return;
      pendingIntensity = finiteLevel(state.intensity, 0);
      pendingShare = optionalShare(state.aurelianShare) ?? pendingShare;
      pendingLevel = finiteLevel(state.level);
      const at = context.currentTime;
      const elapsed = at - lastRetargetAt;
      if (elapsed >= 0 && elapsed < SCORE_RETARGET_INTERVAL_SECONDS) return;
      const intensityChanged = Math.abs(pendingIntensity - appliedIntensity) >= STATE_EPSILON;
      const cultureChanged = Math.abs(pendingShare - appliedShare) >= STATE_EPSILON;
      const levelChanged = Math.abs(pendingLevel - appliedLevel) >= STATE_EPSILON;
      if (!intensityChanged && !cultureChanged && !levelChanged) return;
      const speed = Number.isFinite(playbackSpeed) && playbackSpeed > 0
        ? Math.min(4, Math.max(0.25, playbackSpeed)) : 1;
      if (intensityChanged) {
        const seconds = (pendingIntensity >= appliedIntensity ? 0.6 : 1.6) / speed;
        retarget(core.gain, coreLayerLevel(pendingIntensity), at, seconds);
        retarget(rhythm.gain, rhythmLayerLevel(pendingIntensity), at, seconds);
      }
      if (cultureChanged) {
        const culture = scoreCultureAt(pendingShare);
        retarget(ironwork.gain, culture.ironwork, at, 0.75 / speed);
        retarget(monolith.gain, culture.monolith, at, 0.75 / speed);
      }
      if (levelChanged && started) retarget(level.gain, SCORE_LEVEL * pendingLevel, at, 1.2 / speed);
      appliedIntensity = pendingIntensity;
      appliedShare = pendingShare;
      appliedLevel = pendingLevel;
      lastRetargetAt = at;
    },
    stop: (): void => {
      if (stopped) return;
      stopped = true;
      controller.abort();
      if (retry !== null) clearTimeout(retry);
      resolveReady(false);
      if (!started) { release(); return; }
      const at = context.currentTime;
      retarget(level.gain, 0, at, 0.02);
      for (const source of startedSources) {
        try { source.stop(at + SOURCE_STOP_SECONDS); } catch { /* Context already closed. */ }
      }
      // A suspended/closed context need not dispatch ended; wall time still
      // releases the decoded buffers after the same bounded shutdown fade.
      setTimeout(release, SCORE_CLOSE_DELAY_MS);
    },
  };
}

export const startBattleScore = createAuthoredScore;

export function coreLayerLevel(intensity: number): number { return 0.82 + finiteLevel(intensity, 0) * 0.18; }
export function rhythmLayerLevel(intensity: number): number {
  const pressure = finiteLevel(intensity, 0);
  return 0.16 + smoothstep(0.1, 0.65, pressure) * 0.54 + fullLayerLevel(pressure);
}
/** Extra rhythmic weight arrives only once combat is committed. */
export function fullLayerLevel(intensity: number): number {
  const pressure = finiteLevel(intensity, 0);
  return smoothstep(0.46, 0.74, pressure) * (0.035 + 0.075 * pressure);
}
function retarget(param: AudioParam, value: number, at: number, seconds: number): void {
  param.cancelScheduledValues(at);
  param.setTargetAtTime(value, at, Math.max(0.01, seconds));
}
function optionalShare(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}
function finiteLevel(value: number | undefined, fallback = 1): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}
function smoothstep(from: number, to: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}
