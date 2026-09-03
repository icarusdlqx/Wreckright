import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import type { SimEvent } from '../sim/events';
import {
  coalesceImpacts,
  coalesceMisses,
  cueTier,
  fieldRank,
  rankFieldCues,
  type FieldCue,
} from './audioFieldRank';

function hit(targetId: number, tick: number, damage: number, weaponId: string): SimEvent {
  return {
    type: 'projectile_hit', tick, shooterId: 99, targetId, weaponId,
    location: 'centre_torso', damage, arc: 'front',
  };
}

function miss(targetId: number, tick: number): SimEvent {
  return { type: 'projectile_miss', tick, shooterId: 99, targetId, weaponId: 'lrm20' };
}

describe('volley coalescing', () => {
  it('folds every hit on one plate in one tick into a single weighted impact', () => {
    const groups = coalesceImpacts([
      hit(1, 10, 1, 'lrm20'),
      hit(1, 10, 1, 'lrm20'),
      hit(2, 10, 3, 'ac5'),
      hit(1, 10, 5, 'ppc'),
      hit(1, 11, 1, 'lrm20'),
      { type: 'staggered', tick: 10, entityId: 1 },
    ]);
    expect(groups).toEqual([
      { targetId: 1, tick: 10, count: 3, damage: 7, weaponId: 'ppc', shooterId: 99 },
      { targetId: 2, tick: 10, count: 1, damage: 3, weaponId: 'ac5', shooterId: 99 },
      { targetId: 1, tick: 11, count: 1, damage: 1, weaponId: 'lrm20', shooterId: 99 },
    ]);
  });

  it('counts near misses per target and tick', () => {
    expect(coalesceMisses([miss(1, 10), miss(1, 10), miss(2, 10), miss(1, 12)])).toEqual([
      { targetId: 1, tick: 10, count: 2, shooterId: 99 },
      { targetId: 2, tick: 10, count: 1, shooterId: 99 },
      { targetId: 1, tick: 12, count: 1, shooterId: 99 },
    ]);
  });
});

describe('field cue ranking', () => {
  it('tiers cues by selection, then ownership, then the rest of the field', () => {
    const world = playerWorld('audio-rank-tier');
    const team = world.playerTeam ?? 0;
    const ally = world.entities.find((entity) => entity.team === team);
    const enemy = world.entities.find((entity) => entity.team !== team);
    if (ally === undefined || enemy === undefined) throw new Error('rank test needs two teams');
    const selected = new Set([ally.id]);
    expect(cueTier(world, selected, [enemy.id, ally.id])).toBe(2);
    expect(cueTier(world, new Set(), [enemy.id, ally.id])).toBe(1);
    expect(cueTier(world, new Set(), [enemy.id, null])).toBe(0);
    expect(cueTier(world, new Set(), [])).toBe(0);
  });

  it('orders a batch best-first so the admission window meets what matters', () => {
    const cue = (name: string, tier: 0 | 1 | 2 | 3, distance: number, secondary = false): FieldCue & { name: string } => ({
      name,
      rank: fieldRank(tier, { level: 1, distance }, secondary),
      play: () => undefined,
    });
    const ranked = rankFieldCues([
      cue('far-hostile', 0, 800),
      cue('near-miss-on-selected', 2, 10, true),
      cue('near-hostile', 0, 30),
      cue('owned', 1, 400),
      cue('selected', 2, 200),
      cue('terminal', 3, 700),
      cue('console', 1, 0),
    ]) as (FieldCue & { name: string })[];
    expect(ranked.map((entry) => entry.name)).toEqual([
      'terminal',
      'selected',
      'near-miss-on-selected',
      'console',
      'owned',
      'near-hostile',
      'far-hostile',
    ]);
  });

  it('keeps a console placement at distance zero for ranking', () => {
    expect(fieldRank(1, { level: 0.1, distance: null })).toEqual({
      tier: 1, secondary: false, distance: 0,
    });
  });
});
