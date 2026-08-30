import { AudioGraph } from './audioGraph';
import { readAudioMuted, writeAudioMuted } from './audioPreference';
import {
  SCORE_CLOSE_DELAY_MS,
  SCORE_RETARGET_INTERVAL_SECONDS,
  createProceduralScore,
  type ScoreHandle,
  type ScoreState,
} from './audioScoreGraph';
import {
  STRATEGIC_SCORE_TREATMENTS,
  type StrategicScoreSurface,
} from './audioScoreTreatments';

interface LeaseState {
  readonly surface: StrategicScoreSurface;
  readonly order: number;
  aurelianShare: number | null;
}

export interface StrategicScoreLease {
  update(aurelianShare: number | null): void;
  release(): void;
}

const NEUTRAL_CULTURE_SHARE = 0.5;
const RETARGET_RETRY_MS = Math.ceil(SCORE_RETARGET_INTERVAL_SECONDS * 1_000) + 1;

/** One bounded score graph for a contiguous visit to the strategic screens. */
export class StrategicScoreDirector {
  private readonly leases = new Map<symbol, LeaseState>();
  private readonly listeners = new Set<() => void>();
  private graph: AudioGraph | null = null;
  private score: ScoreHandle | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private nextOrder = 0;
  private lastShare = NEUTRAL_CULTURE_SHARE;
  private mutedState = readAudioMuted();
  private destroyed = false;

  get muted(): boolean {
    return this.mutedState;
  }

  get active(): boolean {
    return this.leases.size > 0;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Called inside the route-changing gesture, before the lazy screen mounts. */
  prepare(): void {
    if (this.destroyed) return;
    this.syncMuted();
    this.ensureGraph();
    this.graph?.resume();
  }

  /** A gesture on an already-mounted strategic screen can unlock a cold route. */
  unlock(): void {
    if (!this.active) return;
    this.prepare();
    this.apply();
  }

  acquire(surface: StrategicScoreSurface, aurelianShare: number | null): StrategicScoreLease {
    const key = Symbol(surface);
    const state: LeaseState = {
      surface,
      order: this.nextOrder,
      aurelianShare: validShare(aurelianShare),
    };
    this.nextOrder += 1;
    this.leases.set(key, state);
    this.apply();
    let released = false;
    return {
      update: (share): void => {
        if (released) return;
        state.aurelianShare = validShare(share);
        this.apply();
      },
      release: (): void => {
        if (released) return;
        released = true;
        this.leases.delete(key);
        if (this.leases.size === 0) this.closeGraph();
        else this.apply();
      },
    };
  }

  toggleMuted(): boolean {
    this.mutedState = !this.mutedState;
    writeAudioMuted(this.mutedState);
    this.graph?.setMuted(this.mutedState);
    this.emit();
    return this.mutedState;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.leases.clear();
    this.closeGraph();
    this.listeners.clear();
  }

  private ensureGraph(): void {
    if (this.graph !== null) return;
    const graph = AudioGraph.create(this.mutedState);
    if (graph === null) return;
    this.graph = graph;
    const chosen = this.chosenLease();
    const share = chosen?.aurelianShare ?? this.lastShare;
    const initialLevel = chosen === null ? 0 : STRATEGIC_SCORE_TREATMENTS[chosen.surface].level;
    this.score = createProceduralScore(graph, share, initialLevel);
    this.apply();
  }

  private chosenLease(): LeaseState | null {
    let chosen: LeaseState | null = null;
    for (const lease of this.leases.values()) {
      if (
        chosen === null
        || priority(lease.surface) > priority(chosen.surface)
        || (priority(lease.surface) === priority(chosen.surface) && lease.order > chosen.order)
      ) chosen = lease;
    }
    return chosen;
  }

  private currentState(): ScoreState {
    const chosen = this.chosenLease();
    if (chosen === null) return { intensity: 0, aurelianShare: this.lastShare, level: 0 };
    if (chosen.aurelianShare !== null) this.lastShare = chosen.aurelianShare;
    const treatment = STRATEGIC_SCORE_TREATMENTS[chosen.surface];
    return {
      intensity: treatment.intensity,
      aurelianShare: chosen.aurelianShare ?? this.lastShare,
      level: treatment.level,
    };
  }

  private apply(): void {
    const score = this.score;
    if (score === null) return;
    score.setState(this.currentState());
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = setTimeout(() => {
      this.retry = null;
      this.score?.setState(this.currentState());
    }, RETARGET_RETRY_MS);
  }

  private closeGraph(): void {
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    this.score?.stop();
    this.score = null;
    const graph = this.graph;
    this.graph = null;
    graph?.close(SCORE_CLOSE_DELAY_MS);
    this.lastShare = NEUTRAL_CULTURE_SHARE;
  }

  private syncMuted(): void {
    const stored = readAudioMuted();
    if (stored === this.mutedState) return;
    this.mutedState = stored;
    this.graph?.setMuted(stored);
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function priority(surface: StrategicScoreSurface): number {
  return surface === 'mechbay' ? 1 : 0;
}

function validShare(value: number | null): number | null {
  return value !== null && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : null;
}
