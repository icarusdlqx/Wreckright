import { describe, expect, it } from 'vitest';
import { playerWorld, spawnDesign } from '../../tests/support';
import type { MechEntity, World } from '../sim/types';
import {
  battleCultureShare,
  scoreCultureAt,
} from './audioScoreVoicing';

function emptyWorld(seed: string): World {
  const world = playerWorld(seed);
  world.entities = [];
  world.vision?.visible.clear();
  world.vision?.identified.clear();
  world.vision?.detected.clear();
  world.vision?.tracks.clear();
  world.vision?.observedHulks.clear();
  return world;
}

function sensorDetect(world: World, hostile: MechEntity): void {
  const vision = world.vision;
  if (vision === null) throw new Error('culture test needs player vision');
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

describe('score culture arrangement', () => {
  it('crossfades faction colors without changing the shared theme pitch', () => {
    expect(scoreCultureAt(0)).toEqual({ ironwork: 1, monolith: 0 });
    expect(scoreCultureAt(1)).toEqual({ ironwork: 0, monolith: 1 });
    const midpoint = scoreCultureAt(0.5);
    expect(midpoint.ironwork).toBeCloseTo(Math.SQRT1_2);
    expect(midpoint.monolith).toBeCloseTo(Math.SQRT1_2);
    for (let index = 0; index <= 20; index += 1) {
      const mix = scoreCultureAt(index / 20);
      expect(mix.ironwork ** 2 + mix.monolith ** 2).toBeCloseTo(1);
    }
  });
  it('clamps invalid shares', () => {
    for (const share of [-1, -Infinity, NaN]) expect(scoreCultureAt(share)).toEqual(scoreCultureAt(0));
    for (const share of [2, Infinity]) expect(scoreCultureAt(share)).toEqual(scoreCultureAt(1));
  });
});

describe('battle culture share', () => {
  it('weights operational mechs, vehicles, and emplacements equally', () => {
    const world = emptyWorld('culture-frames');
    const vehicle = spawnDesign(world, 'drover_carrier', 0);
    const emplacement = spawnDesign(world, 'redoubt_emplacement', 0);
    spawnDesign(world, 'wisp_scout', 0);

    expect(vehicle.frame).toBe('vehicle');
    expect(emplacement.frame).toBe('turret');
    expect(battleCultureShare(world)).toBeCloseTo(1 / 3);
  });

  it('never lets a sensor-only hostile disclose its culture', () => {
    const world = emptyWorld('culture-hostile-privacy');
    spawnDesign(world, 'drover_carrier', 0);
    const hostile = spawnDesign(world, 'wisp_scout', 1);
    const vision = world.vision;
    if (vision === null) throw new Error('culture test needs player vision');

    expect(battleCultureShare(world)).toBe(0);
    sensorDetect(world, hostile);
    expect(battleCultureShare(world)).toBe(0);

    vision.visible.add(hostile.id);
    expect(battleCultureShare(world)).toBe(0.5);
    vision.visible.delete(hostile.id);
    expect(battleCultureShare(world)).toBe(0);
  });

  it('excludes every non-operational state and unknown chassis', () => {
    const world = emptyWorld('culture-operational');
    const linewrought = spawnDesign(world, 'drover_carrier', 0);
    const destroyed = spawnDesign(world, 'wisp_scout', 0);
    const withdrawn = spawnDesign(world, 'wisp_scout', 0);
    const dead = spawnDesign(world, 'wisp_scout', 0);
    const ejected = spawnDesign(world, 'wisp_scout', 0);
    const unknown = spawnDesign(world, 'wisp_scout', 0);
    destroyed.destroyed = true;
    withdrawn.withdrawn = true;
    dead.pilot.dead = true;
    ejected.pilot.ejected = true;
    unknown.chassisId = 'missing_chassis';

    expect(battleCultureShare(world)).toBe(0);
    linewrought.withdrawn = true;
    expect(battleCultureShare(world)).toBeNull();
  });

  it('matches exact-entity presentation when no player vision exists', () => {
    const world = emptyWorld('culture-no-vision');
    spawnDesign(world, 'drover_carrier', 0);
    spawnDesign(world, 'wisp_scout', 1);
    world.vision = null;

    expect(battleCultureShare(world)).toBe(0.5);
  });

  it('is order-independent, recomputed, and leaves simulation state untouched', () => {
    const world = emptyWorld('culture-pure');
    spawnDesign(world, 'drover_carrier', 0);
    spawnDesign(world, 'wisp_scout', 0);
    spawnDesign(world, 'wisp_scout', 0);
    const before = structuredClone(world.entities);

    expect(battleCultureShare(world)).toBeCloseTo(2 / 3);
    expect(world.entities).toEqual(before);
    world.entities.reverse();
    expect(battleCultureShare(world)).toBeCloseTo(2 / 3);

    world.entities[0]!.withdrawn = true;
    expect(battleCultureShare(world)).toBe(0.5);
  });

  it('returns null when no eligible culture is present', () => {
    expect(battleCultureShare(emptyWorld('culture-empty'))).toBeNull();
  });
});
