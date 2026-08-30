import { describe, expect, it } from 'vitest';
import { playerWorld, spawnDesign } from '../../tests/support';
import type { MechEntity, World } from '../sim/types';
import {
  battleCultureShare,
  SCORE_CULTURE_VOICINGS,
  scoreVoicingAt,
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

describe('score culture voicing', () => {
  it('keeps exact culture endpoints and uses musical interpolation between them', () => {
    expect(scoreVoicingAt(0)).toBe(SCORE_CULTURE_VOICINGS.linewrought);
    expect(scoreVoicingAt(1)).toBe(SCORE_CULTURE_VOICINGS.aurelian);

    const midpoint = scoreVoicingAt(0.5);
    expect(midpoint.rootHz).toBeCloseTo(Math.sqrt(43.65 * 46.25));
    expect(midpoint.fifthHz).toBeCloseTo(Math.sqrt(65.41 * 69.3));
    expect(midpoint.pulseHz).toBeCloseTo(Math.sqrt(87.31 * 103.83));
    expect(midpoint.fullHz).toBeCloseTo(Math.sqrt(103.83 * 130.81));
    expect(midpoint.droneCutoffHz).toBeCloseTo(Math.sqrt(190 * 260));
    expect(midpoint.pulseCutoffHz).toBeCloseTo(Math.sqrt(520 * 880));
    expect(midpoint.fullCutoffHz).toBeCloseTo(Math.sqrt(420 * 1400));
    expect(midpoint.droneQ).toBeCloseTo(1.05);
    expect(midpoint.pulseQ).toBeCloseTo(1.5);
    expect(midpoint.fullQ).toBeCloseTo(1.825);
    expect(midpoint.rootLevel).toBeCloseTo(0.51);
    expect(midpoint.fifthLevel).toBeCloseTo(0.26);
    expect(midpoint.pulseLevel).toBeCloseTo(0.31);
  });

  it('clamps out-of-range shares before interpolation', () => {
    expect(scoreVoicingAt(-1)).toBe(SCORE_CULTURE_VOICINGS.linewrought);
    expect(scoreVoicingAt(Number.NEGATIVE_INFINITY))
      .toBe(SCORE_CULTURE_VOICINGS.linewrought);
    expect(scoreVoicingAt(2)).toBe(SCORE_CULTURE_VOICINGS.aurelian);
    expect(scoreVoicingAt(Number.POSITIVE_INFINITY))
      .toBe(SCORE_CULTURE_VOICINGS.aurelian);
    expect(scoreVoicingAt(Number.NaN)).toBe(SCORE_CULTURE_VOICINGS.linewrought);
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
