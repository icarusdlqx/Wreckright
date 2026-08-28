import { describe, expect, it } from 'vitest';
import { spawnDesign, testWorld, unitOf } from '../../../tests/support';
import { visionFor, type ContactTrack, type TeamVision } from '../sensors';
import type { MechEntity, Vec2, World } from '../types';
import { chooseIndirectTrackTarget } from './indirect';
import { decideTactical, difficultyTier, runTeamAi } from './tactical';

function sensorPicture(world: World, shooter: MechEntity): TeamVision {
  const vision = visionFor(world, shooter.team);
  if (vision === null) throw new Error('need team vision');
  vision.visible.clear();
  vision.identified.clear();
  vision.detected.clear();
  vision.tracks.clear();
  return vision;
}

function addTrack(
  world: World,
  vision: TeamVision,
  target: MechEntity,
  pos: Vec2,
  current: boolean = true,
): ContactTrack {
  const track: ContactTrack = {
    id: target.id,
    team: target.team,
    frame: target.frame,
    chassisClass: target.chassisClass,
    pos: { ...pos },
    tick: world.tick,
    source: 'sensor',
  };
  vision.tracks.set(target.id, track);
  if (current) vision.detected.add(target.id);
  return track;
}

describe('tactical indirect contact selection', () => {
  it('orders only current coarse tracks by range, then entity id', () => {
    const world = testWorld('ai-indirect-order');
    const battery = unitOf(world, 'cairn_battery');
    const directOnly = unitOf(world, 'sentinel_brawler');
    const targets = world.entities
      .filter((entity) => entity.team !== battery.team)
      .sort((a, b) => a.id - b.id);
    const [lower, higher, stale] = targets;
    if (lower === undefined || higher === undefined || stale === undefined) {
      throw new Error('need three hostile contacts');
    }
    battery.pos = { x: 24, y: 24 };
    directOnly.pos = { ...battery.pos };
    const vision = sensorPicture(world, battery);
    addTrack(world, vision, stale, { x: 72, y: 24 }, false);
    addTrack(world, vision, higher, { x: 120, y: 24 });
    addTrack(world, vision, lower, { x: 216, y: 24 });

    expect(chooseIndirectTrackTarget(world, battery)).toBe(higher.id);

    vision.tracks.get(lower.id)!.pos = { x: 24, y: 120 };
    expect(chooseIndirectTrackTarget(world, battery)).toBe(lower.id);
    expect(chooseIndirectTrackTarget(world, directOnly)).toBeNull();
  });

  it('uses the fallback only when no optical target is scored', () => {
    const world = testWorld('ai-indirect-optical-first');
    const battery = unitOf(world, 'cairn_battery');
    const [optical, sensor] = world.entities.filter((entity) => entity.team !== battery.team);
    if (optical === undefined || sensor === undefined) throw new Error('need two hostiles');
    battery.pos = { x: 120, y: 120 };
    optical.pos = { x: 240, y: 120 };
    const vision = sensorPicture(world, battery);
    vision.visible.add(optical.id);
    vision.identified.add(optical.id);
    addTrack(world, vision, sensor, { x: 168, y: 120 });

    decideTactical(world, battery, null, difficultyTier(world, 'regular'));

    expect(battery.targetId).toBe(optical.id);
  });

  it('applies the same current-track fallback to either tactical team', () => {
    const outcomes = [0, 1].map((team) => {
      const world = testWorld(`ai-indirect-team-${team}`);
      for (const entity of world.entities) {
        entity.destroyed = true;
        entity.controller = 'orders';
      }
      const battery = spawnDesign(world, 'cairn_battery', team, { x: 120, y: 120 });
      const target = spawnDesign(world, 'sentinel_brawler', 1 - team, { x: 900, y: 900 });
      battery.controller = 'tactical';
      target.controller = 'orders';
      addTrack(world, sensorPicture(world, battery), target, { x: 264, y: 216 });

      runTeamAi(world, team, difficultyTier(world, 'regular'));

      return {
        selectedTrack: battery.targetId === target.id,
        calledShot: battery.calledShot,
        stance: battery.ai.stance,
        path: battery.path,
      };
    });

    expect(outcomes).toEqual([
      { selectedTrack: true, calledShot: null, stance: 'hold', path: [] },
      { selectedTrack: true, calledShot: null, stance: 'hold', path: [] },
    ]);
  });

  it('chooses identically when hidden exact state differs behind the same track', () => {
    const worlds = [testWorld('ai-indirect-private'), testWorld('ai-indirect-private')];
    const batteries = worlds.map((world) => unitOf(world, 'cairn_battery'));
    const targets = worlds.map((world, index) => {
      const battery = batteries[index]!;
      const target = world.entities.find((entity) => entity.team !== battery.team);
      if (target === undefined) throw new Error('need hostile contact');
      battery.pos = { x: 120, y: 120 };
      addTrack(world, sensorPicture(world, battery), target, { x: 264, y: 216 });
      return target;
    });
    const changed = targets[1]!;
    changed.pos = { x: 900, y: 900 };
    changed.motion = 'run';
    changed.intendedMotion = 'run';
    changed.path = [{ x: 840, y: 840 }, { x: 780, y: 780 }];
    changed.locations.centre_torso.armour = 0;
    changed.locations.centre_torso.internal *= 0.2;

    for (let index = 0; index < worlds.length; index += 1) {
      decideTactical(
        worlds[index]!,
        batteries[index]!,
        null,
        difficultyTier(worlds[index]!, 'regular'),
      );
    }

    expect(batteries.map(({ targetId, calledShot }) => ({ targetId, calledShot })))
      .toEqual([
        { targetId: targets[0]!.id, calledShot: null },
        { targetId: targets[1]!.id, calledShot: null },
      ]);
  });
});
