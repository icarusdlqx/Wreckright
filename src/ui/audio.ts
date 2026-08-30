import type { TerrainMapData } from '../schema/map';
import type { Faction } from '../schema/faction';
import type { SimEvent } from '../sim/events';
import type { MechEntity, Vec2, World } from '../sim/types';
import { weaponFireProfile } from '../sim/weaponModes';
import { canPresentEntity } from '../render3d/visibilityPresentation';
import { machineCulture } from '../render3d/machineCulture';
import { startAmbient, type AmbientHandle } from './audioAmbient';
import {
  advanceHeatTier,
  footfallSurfaceAt,
  summariseEventCues,
  type HeatCue,
  type HeatTier,
} from './audioCues';
import { AudioGraph, type VoicePlacement } from './audioGraph';
import { BattleScoreDirector } from './audioBattleScore';
import { isPlayerConsoleCue, lifecyclePlacement, preferredLifecycleEntity } from './audioCueRouting';
import { readAudioMuted, writeAudioMuted } from './audioPreference';
import { SCORE_CLOSE_DELAY_MS } from './audioScore';
import { playSupportResolution } from './audioSupport';
import {
  playAbility,
  playAlphaStrike,
  playChime,
  playCollapse,
  playFootfall,
  playHeatWarning,
  playJets,
  playLanding,
  playLifecycleMoment,
  playMissionMessage,
  playOrder,
  playPowerSweep,
  playRestart,
  playSelect,
} from './audioVoices';
import { playCrunch, playDestruction, playImpact, playWeapon } from './audioWeapons';

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

  private graph: AudioGraph | null = null;
  private ambient: AmbientHandle | null = null;
  private readonly battleScore = new BattleScoreDirector();
  private pendingAmbient: string | null = null;
  private terrain: TerrainMapData | null = null;
  private readonly heatTiers = new Map<number, HeatTier>();
  private readonly cueEvents: SimEvent[] = [];
  private readonly destroyedThisBatch = new Set<number>();
  private readonly knockedDownThisBatch = new Set<number>();
  private mutedState = readAudioMuted();
  private destroyed = false;

  get muted(): boolean {
    return this.mutedState;
  }

  toggleMuted(): boolean {
    this.mutedState = !this.mutedState;
    writeAudioMuted(this.mutedState);
    this.graph?.setMuted(this.mutedState);
    return this.mutedState;
  }

  /** Must run under a pointer or key gesture, or the browser suspends it. */
  unlock(): void {
    if (this.destroyed) return;
    if (this.graph !== null) {
      this.graph.resume();
      return;
    }
    this.graph = AudioGraph.create(this.mutedState);
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
    this.terrain = null;
    this.heatTiers.clear();
    this.cueEvents.length = 0;
    this.destroyedThisBatch.clear();
    this.knockedDownThisBatch.clear();
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
    if (this.mutedState) return;

    this.destroyedThisBatch.clear();
    this.knockedDownThisBatch.clear();
    for (const event of events) {
      if (event.type === 'mech_destroyed') this.destroyedThisBatch.add(event.entityId);
      else if (event.type === 'knocked_down') this.knockedDownThisBatch.add(event.entityId);
    }

    for (const event of events) {
      if (isPlayerConsoleCue(world, event)) this.cueEvents.push(event);
    }
    const summary = summariseEventCues(this.cueEvents);
    if (summary.abilityVoice !== null) {
      playAbility(graph, summary.abilityVoice, summary.abilityCount);
    }
    if (summary.alphaCount > 0) playAlphaStrike(graph, summary.alphaCount);
    if (summary.missionMessage) playMissionMessage(graph);

    const preferredEjection = preferredLifecycleEntity(world, events, 'pilot_ejected');
    const preferredWithdrawal = preferredLifecycleEntity(world, events, 'unit_withdrew');
    let chimed = false;
    let ejectionVoiced = false;
    let withdrawalVoiced = false;
    for (const event of events) {
      switch (event.type) {
        case 'weapon_fired': {
          if (!canPresentEntity(world, event.shooterId)) break;
          const weapon = world.catalog.weapons.get(event.weaponId);
          const at = positionOf(world, event.shooterId);
          if (weapon !== undefined && at !== null) {
            const profile = weaponFireProfile(weapon, event.modeId);
            playWeapon(
              graph,
              weapon.faction,
              weapon.visual.style,
              profile.projectiles,
              this.placementAt(at),
            );
          }
          break;
        }
        case 'projectile_hit': {
          if (!canPresentEntity(world, event.targetId)) break;
          const at = positionOf(world, event.targetId);
          const weapon = world.catalog.weapons.get(event.weaponId);
          if (at !== null) {
            playImpact(
              graph,
              {
                type: weapon?.type ?? 'ballistic',
                style: weapon?.visual.style ?? 'tracer',
                damage: event.damage,
              },
              this.placementAt(at),
            );
          }
          break;
        }
        case 'critical_hit': {
          if (!canPresentEntity(world, event.entityId)) break;
          const at = positionOf(world, event.entityId);
          if (at !== null) playCrunch(graph, this.placementAt(at));
          break;
        }
        case 'ammo_explosion': {
          if (!canPresentEntity(world, event.entityId)) break;
          const at = positionOf(world, event.entityId);
          if (at !== null) {
            playDestruction(graph, { kind: 'ammo', damage: event.damage }, this.placementAt(at));
          }
          break;
        }
        case 'mech_destroyed': {
          if (!canPresentEntity(world, event.entityId)) break;
          const entity = entityOf(world, event.entityId);
          if (entity !== null) {
            const placement = this.placementAt(entity.pos);
            playDestruction(graph, { kind: 'terminal', tonnage: entity.tonnage }, placement);
            const faction = factionOf(world, entity) ?? 'linewrought';
            // A prior knockdown already owns the landing voice. A knockdown in
            // this batch has not reached the renderer, so the terminal fall owns it instead.
            if (entity.downRemaining <= 0 || this.knockedDownThisBatch.has(entity.id)) {
              playCollapse(
                graph,
                placement,
                entity.tonnage,
                presentationDelay(
                  reducedMotion ? 0 : machineCulture(faction).terminalFallSeconds,
                  playbackSpeed,
                ),
                'terminal',
              );
            }
          }
          break;
        }
        case 'knocked_down': {
          if (!canPresentEntity(world, event.entityId)) break;
          if (this.destroyedThisBatch.has(event.entityId)) break;
          const entity = entityOf(world, event.entityId);
          if (entity !== null) {
            playCollapse(
              graph,
              this.placementAt(entity.pos),
              entity.tonnage,
              presentationDelay(0.4, playbackSpeed),
            );
          }
          break;
        }
        case 'shutdown': {
          if (!canPresentEntity(world, event.entityId)) break;
          const at = positionOf(world, event.entityId);
          if (at !== null) playPowerSweep(graph, 360, 50, 0.9, this.placementAt(at));
          break;
        }
        case 'restart': {
          if (!canPresentEntity(world, event.entityId)) break;
          const entity = entityOf(world, event.entityId);
          const faction = entity === null ? null : factionOf(world, entity);
          if (entity !== null && faction !== null) {
            playRestart(graph, faction, this.placementAt(entity.pos, 0.7));
          }
          break;
        }
        case 'jump_started': {
          if (!canPresentEntity(world, event.entityId)) break;
          const at = positionOf(world, event.entityId);
          if (at !== null) playJets(graph, this.placementAt(at));
          break;
        }
        case 'jump_landed':
          if (canPresentEntity(world, event.entityId)) {
            playLanding(graph, this.placementAt({ x: event.x, y: event.y }), 1);
          }
          break;
        case 'stood_up':
        case 'pilot_ejected':
        case 'unit_withdrew': {
          if (event.type === 'pilot_ejected'
            && (ejectionVoiced || event.entityId !== preferredEjection)) break;
          if (event.type === 'unit_withdrew'
            && (withdrawalVoiced || event.entityId !== preferredWithdrawal)) break;
          if (!canPresentEntity(world, event.entityId)) break;
          const at = positionOf(world, event.entityId);
          if (at !== null) {
            const placement = lifecyclePlacement(event.type, this.placementAt(at));
            playLifecycleMoment(graph, event.type, placement);
          }
          if (event.type === 'pilot_ejected') ejectionVoiced = true;
          if (event.type === 'unit_withdrew') withdrawalVoiced = true;
          break;
        }
        case 'support_resolved':
          if (event.team === (world.playerTeam ?? 0)) {
            playSupportResolution(
              graph,
              event.call,
              this.placementAt({ x: event.x, y: event.y }),
            );
          }
          break;
        case 'zone_captured':
        case 'objective_settled':
          if (!chimed) {
            playChime(graph);
            chimed = true;
          }
          break;
        default:
          break;
      }
    }

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

  private restartAmbient(): void {
    this.ambient?.stop();
    this.ambient = null;
    if (
      !this.battleScore.overridden
      && this.graph !== null
      && this.pendingAmbient !== null
    ) {
      this.ambient = startAmbient(this.graph, this.pendingAmbient);
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
}

/** Presentation motion advances in simulation seconds, while Web Audio schedules real seconds. */
function presentationDelay(seconds: number, playbackSpeed: number): number {
  const speed = Number.isFinite(playbackSpeed) && playbackSpeed > 0 ? playbackSpeed : 1;
  return seconds / speed;
}

function entityOf(world: World, id: number): MechEntity | null {
  return world.entities.find((candidate) => candidate.id === id) ?? null;
}

function positionOf(world: World, id: number): Vec2 | null {
  return entityOf(world, id)?.pos ?? null;
}

function factionOf(world: World, entity: MechEntity): Faction | null {
  return world.catalog.chassis.get(entity.chassisId)?.faction ?? null;
}
