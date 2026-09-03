import type { World } from '../sim/types';
import type { SimEvent } from '../sim/events';
import type { AudioGraph } from './audioGraph';
import {
  BattleIntensity,
  SCORE_RETARGET_INTERVAL_SECONDS,
  startBattleScore,
  type ScoreHandle,
  type ScoreState,
} from './audioScore';
import { battleCultureShare } from './audioScoreVoicing';
import { STRATEGIC_SCORE_TREATMENTS } from './audioScoreTreatments';

const RETARGET_RETRY_MS = Math.ceil(SCORE_RETARGET_INTERVAL_SECONDS * 1_000) + 1;

/** Keeps the battle arc live while a briefing bay temporarily owns its voice. */
export class BattleScoreDirector {
  private readonly intensity = new BattleIntensity();
  private handle: ScoreHandle | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private battleState: ScoreState = { intensity: 0, aurelianShare: 0, level: 1 };
  private mechbayShare: number | null = null;
  private mechbayActive = false;

  get overridden(): boolean {
    return this.mechbayActive;
  }

  unlock(graph: AudioGraph): void {
    if (this.handle !== null) return;
    const state = this.currentState();
    this.handle = startBattleScore(graph.scoreBus(), state.aurelianShare, state.level);
    this.handle.setState(state);
  }

  prime(world: World): void {
    const share = battleCultureShare(world);
    if (share !== null) this.battleState = { ...this.battleState, aurelianShare: share };
  }

  observe(world: World, events: readonly SimEvent[], playbackSpeed: number): void {
    this.prime(world);
    if (this.handle === null) return;
    this.battleState = {
      intensity: this.intensity.advance(world, events),
      aurelianShare: this.battleState.aurelianShare,
      level: 1,
    };
    this.handle.setState(this.currentState(), playbackSpeed);
  }

  setMechbay(aurelianShare: number | null): void {
    const share = validShare(aurelianShare);
    if (share !== null || !this.mechbayActive) {
      this.mechbayShare = share ?? this.battleState.aurelianShare;
    }
    this.mechbayActive = true;
    this.applyWithRetry();
  }

  clearMechbay(): void {
    if (!this.mechbayActive) return;
    this.mechbayActive = false;
    this.mechbayShare = null;
    this.applyWithRetry();
  }

  destroy(): void {
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    this.handle?.stop();
    this.handle = null;
    this.intensity.reset();
    this.battleState = { intensity: 0, aurelianShare: 0, level: 1 };
    this.mechbayShare = null;
    this.mechbayActive = false;
  }

  private currentState(): ScoreState {
    if (!this.mechbayActive) return this.battleState;
    const treatment = STRATEGIC_SCORE_TREATMENTS.mechbay;
    return {
      intensity: treatment.intensity,
      aurelianShare: this.mechbayShare,
      level: treatment.level,
    };
  }

  private applyWithRetry(): void {
    this.handle?.setState(this.currentState());
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = setTimeout(() => {
      this.retry = null;
      this.handle?.setState(this.currentState());
    }, RETARGET_RETRY_MS);
  }
}

function validShare(value: number | null): number | null {
  return value !== null && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : null;
}
