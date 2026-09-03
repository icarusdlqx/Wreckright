import type { SimEvent } from '../sim/events';
import type { World } from '../sim/types';
import type { VoiceBus, VoicePlacement } from './audioGraph';

/**
 * Who a field cue belongs to decides who hears it first. Terminal moments
 * outrank everything; then the selected lance, then the player's other
 * machines, then the rest of the field.
 */
export type CueTier = 0 | 1 | 2 | 3;

export interface FieldCueRank {
  tier: CueTier;
  /** Near misses and other colour give way to the hits in the same batch. */
  secondary: boolean;
  distance: number;
}

export interface FieldCue {
  rank: FieldCueRank;
  play(bus: VoiceBus): void;
}

export interface ImpactGroup {
  targetId: number;
  tick: number;
  count: number;
  damage: number;
  /** The heaviest contributor names the plate's material for the whole volley. */
  weaponId: string;
  shooterId: number;
}

export interface MissGroup {
  targetId: number;
  tick: number;
  count: number;
  shooterId: number;
}

type Hit = Extract<SimEvent, { type: 'projectile_hit' }>;
type Miss = Extract<SimEvent, { type: 'projectile_miss' }>;

export function cueTier(
  world: World,
  selected: ReadonlySet<number>,
  ids: readonly (number | null)[],
): CueTier {
  const team = world.playerTeam ?? 0;
  let tier: CueTier = 0;
  for (const id of ids) {
    if (id === null) continue;
    if (selected.has(id)) return 2;
    if (tier === 0 && world.entities.some((entity) => entity.id === id && entity.team === team)) {
      tier = 1;
    }
  }
  return tier;
}

export function fieldRank(
  tier: CueTier,
  placement: VoicePlacement,
  secondary = false,
): FieldCueRank {
  return { tier, secondary, distance: placement.distance ?? 0 };
}

export function compareFieldCues(a: FieldCue, b: FieldCue): number {
  if (a.rank.tier !== b.rank.tier) return b.rank.tier - a.rank.tier;
  if (a.rank.secondary !== b.rank.secondary) return a.rank.secondary ? 1 : -1;
  return a.rank.distance - b.rank.distance;
}

/** Sorted so that admission, which is first-come, becomes best-first. */
export function rankFieldCues(cues: readonly FieldCue[]): FieldCue[] {
  return [...cues].sort(compareFieldCues);
}

/** A volley on one plate is one impact, weighted by what it all added up to. */
export function coalesceImpacts(events: readonly SimEvent[]): ImpactGroup[] {
  const groups = new Map<string, ImpactGroup & { dominant: number }>();
  for (const event of events) {
    if (event.type !== 'projectile_hit') continue;
    const key = volleyKey(event);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, {
        targetId: event.targetId,
        tick: event.tick,
        count: 1,
        damage: event.damage,
        weaponId: event.weaponId,
        shooterId: event.shooterId,
        dominant: event.damage,
      });
      continue;
    }
    group.count += 1;
    group.damage += event.damage;
    if (event.damage > group.dominant) {
      group.dominant = event.damage;
      group.weaponId = event.weaponId;
      group.shooterId = event.shooterId;
    }
  }
  return [...groups.values()].map(({ dominant: _dominant, ...group }) => group);
}

export function coalesceMisses(events: readonly SimEvent[]): MissGroup[] {
  const groups = new Map<string, MissGroup>();
  for (const event of events) {
    if (event.type !== 'projectile_miss') continue;
    const key = volleyKey(event);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, {
        targetId: event.targetId,
        tick: event.tick,
        count: 1,
        shooterId: event.shooterId,
      });
    } else {
      group.count += 1;
    }
  }
  return [...groups.values()];
}

function volleyKey(event: Hit | Miss): string {
  return `${event.targetId}:${event.tick}`;
}
