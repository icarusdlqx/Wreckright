import type { Faction } from '../schema/faction';
import type { SimEvent } from '../sim/events';
import type { MechEntity, Vec2, World } from '../sim/types';
import { weaponFireProfile } from '../sim/weaponModes';
import { canPresentEntity } from '../render3d/visibilityPresentation';
import { machineCulture } from '../render3d/machineCulture';
import { lifecyclePlacement, preferredLifecycleEntity } from './audioCueRouting';
import {
  coalesceImpacts,
  coalesceMisses,
  cueTier,
  fieldRank,
  rankFieldCues,
  type CueTier,
  type FieldCue,
} from './audioFieldRank';
import type { VoiceBus, VoicePlacement } from './audioGraph';
import { playPilotInjury, playStagger, playTear, playWhizz } from './audioHarmVoices';
import { playGroundImpact, playSupportResolution } from './audioSupport';
import {
  playCollapse,
  playJets,
  playLanding,
  playLifecycleMoment,
  playPowerSweep,
  playRestart,
} from './audioVoices';
import { playCrunch, playDestruction, playImpact, playWeapon } from './audioWeapons';

export interface FieldCueContext {
  world: World;
  selected: ReadonlySet<number>;
  placementAt(at: Vec2, scale?: number): VoicePlacement;
  playbackSpeed: number;
  reducedMotion: boolean;
}

export interface FieldCueBatch {
  cues: FieldCue[];
  /** A blast in this batch pushes the score aside. */
  duck: boolean;
}

/** Near misses sit well under the hits they accompany. */
const MISS_LEVEL = 0.4;

/**
 * Turns one tick's events into voices ordered best-first, so the admission
 * window in the graph spends its full-level slots on what the player is
 * watching and quiet-mixes the rest of the field.
 */
export function collectFieldCues(ctx: FieldCueContext, events: readonly SimEvent[]): FieldCueBatch {
  const { world } = ctx;
  const cues: FieldCue[] = [];
  let duck = false;
  const destroyed = new Set<number>();
  const knockedDown = new Set<number>();
  for (const event of events) {
    if (event.type === 'mech_destroyed') destroyed.add(event.entityId);
    else if (event.type === 'knocked_down') knockedDown.add(event.entityId);
  }

  const add = (
    ids: readonly (number | null)[],
    placement: VoicePlacement,
    play: (bus: VoiceBus) => void,
    secondary = false,
    tier: CueTier = cueTier(world, ctx.selected, ids),
  ): void => {
    cues.push({ rank: fieldRank(tier, placement, secondary), play });
  };

  for (const group of coalesceImpacts(events)) {
    if (!canPresentEntity(world, group.targetId)) continue;
    const at = positionOf(world, group.targetId);
    if (at === null) continue;
    const weapon = world.catalog.weapons.get(group.weaponId);
    const profile = {
      type: weapon?.type ?? 'ballistic',
      style: weapon?.visual.style ?? 'tracer',
      damage: group.damage,
      count: group.count,
    } as const;
    const placement = ctx.placementAt(at);
    add([group.shooterId, group.targetId], placement, (bus) => playImpact(bus, profile, placement));
  }

  for (const group of coalesceMisses(events)) {
    if (!canPresentEntity(world, group.targetId)) continue;
    const at = positionOf(world, group.targetId);
    if (at === null) continue;
    const placement = ctx.placementAt(at, MISS_LEVEL);
    add(
      [group.shooterId, group.targetId],
      placement,
      (bus) => playWhizz(bus, group.count, placement),
      true,
    );
  }

  const preferredEjection = preferredLifecycleEntity(world, events, 'pilot_ejected');
  const preferredWithdrawal = preferredLifecycleEntity(world, events, 'unit_withdrew');
  let ejectionVoiced = false;
  let withdrawalVoiced = false;
  for (const event of events) {
    switch (event.type) {
      case 'weapon_fired': {
        if (!canPresentEntity(world, event.shooterId)) break;
        const weapon = world.catalog.weapons.get(event.weaponId);
        const at = positionOf(world, event.shooterId);
        if (weapon === undefined || at === null) break;
        const projectiles = weaponFireProfile(weapon, event.modeId).projectiles;
        const placement = ctx.placementAt(at);
        add([event.shooterId, event.targetId], placement, (bus) =>
          playWeapon(bus, weapon.faction, weapon.visual.style, projectiles, placement),
        );
        break;
      }
      case 'critical_hit':
      case 'location_destroyed':
      case 'staggered': {
        if (!canPresentEntity(world, event.entityId)) break;
        const at = positionOf(world, event.entityId);
        if (at === null) break;
        const placement = ctx.placementAt(at);
        const voice = event.type === 'critical_hit'
          ? playCrunch
          : event.type === 'location_destroyed'
            ? playTear
            : playStagger;
        add([event.entityId], placement, (bus) => voice(bus, placement));
        break;
      }
      case 'pilot_injured': {
        if (!canPresentEntity(world, event.entityId)) break;
        const at = positionOf(world, event.entityId);
        if (at === null) break;
        const tier = cueTier(world, ctx.selected, [event.entityId]);
        // The player's own wounded pilot reports to the console, wherever the machine is.
        const placement = tier > 0 ? { level: 0.11, distance: null } : ctx.placementAt(at);
        add([event.entityId], placement, (bus) => playPilotInjury(bus, placement), false, tier);
        break;
      }
      case 'ammo_explosion': {
        if (!canPresentEntity(world, event.entityId)) break;
        const at = positionOf(world, event.entityId);
        if (at === null) break;
        duck = true;
        const placement = ctx.placementAt(at);
        const profile = { kind: 'ammo', damage: event.damage } as const;
        add([event.entityId], placement, (bus) => playDestruction(bus, profile, placement));
        break;
      }
      case 'mech_destroyed': {
        if (!canPresentEntity(world, event.entityId)) break;
        const entity = entityOf(world, event.entityId);
        if (entity === null) break;
        duck = true;
        const placement = ctx.placementAt(entity.pos);
        const profile = { kind: 'terminal', tonnage: entity.tonnage } as const;
        add([entity.id], placement, (bus) => playDestruction(bus, profile, placement), false, 3);
        // A prior knockdown already owns the landing voice. A knockdown in
        // this batch has not reached the renderer, so the terminal fall owns it instead.
        if (entity.downRemaining <= 0 || knockedDown.has(entity.id)) {
          const faction = factionOf(world, entity) ?? 'linewrought';
          const delay = presentationDelay(
            ctx.reducedMotion ? 0 : machineCulture(faction).terminalFallSeconds,
            ctx.playbackSpeed,
          );
          add([entity.id], placement, (bus) =>
            playCollapse(bus, placement, entity.tonnage, delay, 'terminal'), false, 3);
        }
        break;
      }
      case 'knocked_down': {
        if (!canPresentEntity(world, event.entityId)) break;
        if (destroyed.has(event.entityId)) break;
        const entity = entityOf(world, event.entityId);
        if (entity === null) break;
        const placement = ctx.placementAt(entity.pos);
        const delay = presentationDelay(0.4, ctx.playbackSpeed);
        add([entity.id, event.attackerId], placement, (bus) =>
          playCollapse(bus, placement, entity.tonnage, delay),
        );
        break;
      }
      case 'shutdown':
      case 'jump_started': {
        if (!canPresentEntity(world, event.entityId)) break;
        const at = positionOf(world, event.entityId);
        if (at === null) break;
        const placement = ctx.placementAt(at);
        add([event.entityId], placement, event.type === 'shutdown'
          ? (bus) => playPowerSweep(bus, 360, 50, 0.9, placement)
          : (bus) => playJets(bus, placement));
        break;
      }
      case 'restart': {
        if (!canPresentEntity(world, event.entityId)) break;
        const entity = entityOf(world, event.entityId);
        const faction = entity === null ? null : factionOf(world, entity);
        if (entity === null || faction === null) break;
        const placement = ctx.placementAt(entity.pos, 0.7);
        add([entity.id], placement, (bus) => playRestart(bus, faction, placement));
        break;
      }
      case 'jump_landed': {
        if (!canPresentEntity(world, event.entityId)) break;
        const placement = ctx.placementAt({ x: event.x, y: event.y });
        add([event.entityId], placement, (bus) => playLanding(bus, placement, 1));
        break;
      }
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
          const moment = event.type;
          const placement = lifecyclePlacement(moment, ctx.placementAt(at));
          add([event.entityId], placement, (bus) => playLifecycleMoment(bus, moment, placement));
        }
        if (event.type === 'pilot_ejected') ejectionVoiced = true;
        if (event.type === 'unit_withdrew') withdrawalVoiced = true;
        break;
      }
      case 'support_resolved': {
        if (event.team !== (world.playerTeam ?? 0)) break;
        const placement = ctx.placementAt({ x: event.x, y: event.y });
        const call = event.call;
        add([], placement, (bus) => playSupportResolution(bus, call, placement), false, 1);
        break;
      }
      case 'ground_impact': {
        const placement = ctx.placementAt({ x: event.x, y: event.y });
        const tier: CueTier = event.team === (world.playerTeam ?? 0) ? 1 : 0;
        add([], placement, (bus) => playGroundImpact(bus, placement), false, tier);
        break;
      }
      default:
        break;
    }
  }

  return { cues: rankFieldCues(cues), duck };
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
