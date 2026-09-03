import type { TerrainMapData } from '../schema/map';
import type { Faction } from '../schema/faction';
import type { SimEvent } from '../sim/events';
import type { Vec2, World } from '../sim/types';
import { startAmbient, type AmbientHandle } from './audioAmbient';
import {
  advanceHeatTier,
  footfallSurfaceAt,
  summariseEventCues,
  type HeatCue,
  type HeatTier,
} from './audioCues';
import { collectFieldCues } from './audioFieldCues';
import { AudioGraph, type VoicePlacement } from './audioGraph';
import { BattleScoreDirector } from './audioBattleScore';
import { isPlayerConsoleCue } from './audioCueRouting';
import {
  readAudioLevels,
  readAudioMuted,
  writeAudioLevel,
  writeAudioMuted,
  type AudioLevelKind,
  type AudioLevels,
} from './audioPreference';
import { REACTOR_STRESS_MIN_TIER, startReactorStress, type ReactorStressHandle } from './audioReactor';
import { SCORE_CLOSE_DELAY_MS } from './audioScore';
import { playSupportAcknowledged } from './audioSupport';
import {
  playAbility,
  playAlphaStrike,
  playBattleEnd,
  playChime,
  playFootfall,
  playHeatWarning,
  playMissionMessage,
  playOrder,
  playSelect,
  type BattleOutcome,
} from './audioVoices';

/**
 * Every sound in the game, synthesised.
 *
 * Browsers refuse to start audio until the player has touched the page, so
 * unlock() owns graph creation. Events before then are dropped: a battle must
 * never buffer its first minute and deliver it all on the first click.
 */
export class AudioDirector {
  /** Where the player is listening from, for distance and air absorption. */
  listenAt: Vec2 = { x: 0, y: 0 };
  /** The player's current selection; those machines are heard first. */
  selection: () => readonly number[] = () => [];

  private graph: AudioGraph | null = null;
  private ambient: AmbientHandle | null = null;
  private reactor: ReactorStressHandle | null = null;
  private readonly battleScore = new BattleScoreDirector();
  private pendingAmbient: string | null = null;
  private terrain: TerrainMapData | null = null;
  private readonly heatTiers = new Map<number, HeatTier>();
  private readonly cueEvents: SimEvent[] = [];
  private mutedState = readAudioMuted();
  private levelsState: AudioLevels = readAudioLevels();
  private endVoiced = false;
  private destroyed = false;

  get muted(): boolean {
    return this.mutedState;
  }

  get levels(): Readonly<AudioLevels> {
    return this.levelsState;
  }

  toggleMuted(): boolean {
    this.mutedState = !this.mutedState;
    writeAudioMuted(this.mutedState);
    this.graph?.setMuted(this.mutedState);
    if (this.mutedState) this.reactor?.setTier(0);
    return this.mutedState;
  }

  setLevel(kind: AudioLevelKind, value: number): void {
    this.levelsState = { ...this.levelsState, [kind]: value };
    writeAudioLevel(kind, value);
    this.graph?.setLevel(kind, value);
  }

  /** Must run under a pointer or key gesture, or the browser suspends it. */
  unlock(): void {
    if (this.destroyed) return;
    if (this.graph !== null) {
      this.graph.resume();
      return;
    }
    this.graph = AudioGraph.create(this.mutedState, this.levelsState);
    if (this.graph !== null) this.battleScore.unlock(this.graph);
    this.restartAmbient();
  }

  /** Authored names are presentation data; the sim only needs their effects. */
  setTerrain(map: TerrainMapData): void {
    this.terrain = map;
  }

  setAmbient(atmosphereId: string): void {
    this.pendingAmbient = atmosphereId;
    this.restartAmbient();
  }

  /** Cache only culture that the presentation boundary may reveal at briefing. */
  primeScore(world: World): void {
    this.battleScore.prime(world);
  }

  /** Every battle gets one context, and every context leaves with its battle. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.battleScore.destroy();
    this.stopAmbient();
    this.reactor?.stop();
    this.reactor = null;
    this.terrain = null;
    this.heatTiers.clear();
    this.cueEvents.length = 0;
    const graph = this.graph;
    this.graph = null;
    graph?.close(SCORE_CLOSE_DELAY_MS);
  }

  stopAmbient(): void {
    this.pendingAmbient = null;
    this.ambient?.stop();
    this.ambient = null;
  }

  setMechbayScore(aurelianShare: number | null): void {
    this.ambient?.stop();
    this.ambient = null;
    this.battleScore.setMechbay(aurelianShare);
  }

  clearMechbayScore(): void {
    this.battleScore.clearMechbay();
    this.restartAmbient();
  }

  /** The battle's events, straight from the simulation and never written back. */
  consume(
    world: World,
    events: readonly SimEvent[],
    playbackSpeed = 1,
    reducedMotion = false,
  ): void {
    const heatCue = this.updateHeat(world);
    this.battleScore.observe(world, events, playbackSpeed);
    const graph = this.graph;
    this.cueEvents.length = 0;
    if (graph === null) return;
    const selected = new Set(this.selection());
    this.updateReactorStress(graph, world, selected);
    if (this.mutedState) return;

    for (const event of events) {
      if (isPlayerConsoleCue(world, event)) this.cueEvents.push(event);
    }
    const summary = summariseEventCues(this.cueEvents);
    if (summary.abilityVoice !== null) {
      playAbility(graph, summary.abilityVoice, summary.abilityCount);
    }
    if (summary.alphaCount > 0) playAlphaStrike(graph, summary.alphaCount);
    if (summary.missionMessage) playMissionMessage(graph);

    const batch = collectFieldCues({
      world,
      selected,
      placementAt: (at, scale) => this.placementAt(at, scale),
      playbackSpeed,
      reducedMotion,
    }, events);
    if (batch.duck) graph.duckScore();
    for (const cue of batch.cues) cue.play(graph);

    this.consoleCues(graph, world, events);
    if (heatCue !== null) playHeatWarning(graph, heatCue);
  }

  /** A footfall arrives from the rendered leg plant, not the simulation tick. */
  footfall(at: Vec2, tonnage: number, faction: Faction): void {
    const graph = this.graph;
    if (graph === null || this.mutedState) return;
    const level = 0.25 * (0.5 + tonnage / 160);
    const placement = this.placementAt(at, level);
    if (placement.level <= 0.02) return;
    playFootfall(graph, faction, footfallSurfaceAt(this.terrain, at), placement, tonnage);
  }

  /** Feedback for the player's own orders. */
  order(): void {
    if (!this.mutedState && this.graph !== null) playOrder(this.graph);
  }

  select(): void {
    if (!this.mutedState && this.graph !== null) playSelect(this.graph);
  }

  /** Console reports never compete with the field for admission. */
  private consoleCues(graph: AudioGraph, world: World, events: readonly SimEvent[]): void {
    const team = world.playerTeam ?? 0;
    let chimed = false;
    let acknowledged = false;
    let outcome: BattleOutcome | null = null;
    for (const event of events) {
      if (event.type === 'zone_captured' || event.type === 'objective_settled') {
        if (!chimed) playChime(graph);
        chimed = true;
      } else if (event.type === 'support_called') {
        if (!acknowledged && event.team === team) playSupportAcknowledged(graph);
        acknowledged = acknowledged || event.team === team;
      } else if (event.type === 'mission_ended') {
        outcome = event.status;
      } else if (event.type === 'battle_ended' && outcome === null) {
        outcome = event.winner === null ? 'draw' : event.winner === team ? 'success' : 'failure';
      }
    }
    if (outcome !== null && !this.endVoiced) {
      this.endVoiced = true;
      playBattleEnd(graph, outcome);
    }
  }

  private restartAmbient(): void {
    this.ambient?.stop();
    this.ambient = null;
    if (
      !this.battleScore.overridden
      && this.graph !== null
      && this.pendingAmbient !== null
    ) {
      this.ambient = startAmbient(this.graph.scoreBus(), this.pendingAmbient);
    }
  }

  private placementAt(at: Vec2, scale = 1): VoicePlacement {
    const distance = Math.hypot(at.x - this.listenAt.x, at.y - this.listenAt.y);
    return {
      level: Math.max(0, 1 - distance / 900) ** 1.4 * scale,
      distance,
    };
  }

  /** One hottest-lance cue per tick; four hot machines are still one warning. */
  private updateHeat(world: World): HeatCue | null {
    const team = world.playerTeam ?? 0;
    let hottest: HeatCue | null = null;
    for (const entity of world.entities) {
      if (entity.team !== team || entity.destroyed) {
        this.heatTiers.delete(entity.id);
        continue;
      }
      const fraction = entity.heatCapacity === 0 ? 0 : entity.heat / entity.heatCapacity;
      const transition = advanceHeatTier(this.heatTiers.get(entity.id) ?? 0, fraction);
      this.heatTiers.set(entity.id, transition.tier);
      if (transition.cue !== null && (hottest === null || transition.cue > hottest)) {
        hottest = transition.cue;
      }
    }
    return hottest;
  }

  /** The selected machine's reactor strain follows the same hysteresis as the warnings. */
  private updateReactorStress(graph: AudioGraph, world: World, selected: ReadonlySet<number>): void {
    let tier: HeatTier = 0;
    for (const id of selected) {
      const current = this.heatTiers.get(id) ?? 0;
      if (current > tier) tier = current;
    }
    if (this.mutedState || tier < REACTOR_STRESS_MIN_TIER || world.finished) tier = 0;
    if (tier === 0 && this.reactor === null) return;
    this.reactor ??= startReactorStress(graph.effectsBus());
    this.reactor.setTier(tier);
  }
}
