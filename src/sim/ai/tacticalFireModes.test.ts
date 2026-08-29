import { describe, expect, it } from 'vitest';
import { makeGrid, OPEN_LEGEND, spawnDesign, testWorld, unitOf } from '../../../tests/support';
import { applyHeatGovernor } from '../governor';
import {
  updateTeamVisions,
  visionFor,
  type ContactTrack,
} from '../sensors';
import { isImmobile, type MechEntity, type World } from '../types';
import { decideTactical, difficultyTier, runTeamAi } from './tactical';

const OPEN_TILES = Array.from({ length: 50 }, () => '.'.repeat(50));

function openWorld(seed: string): World {
  const world = testWorld(seed);
  world.terrain = makeGrid({ legend: OPEN_LEGEND, tiles: OPEN_TILES });
  return world;
}

function canisterMount(mech: MechEntity) {
  const mount = mech.weapons.find((candidate) => candidate.weaponId === 'lbx_ac10');
  if (mount === undefined) throw new Error('missing Canister Cannon mount');
  return mount;
}

function isolateOpticalDuel(world: World, shooter: MechEntity, target: MechEntity): void {
  world.entities = [shooter, target];
  shooter.pos = { x: 100, y: 100 };
  target.pos = { x: 280, y: 100 };
  shooter.facing = 0;
  shooter.torsoOffset = 0;
  shooter.sensorRange = 2_000;
  shooter.sightRange = 2_000;
  target.signature = 1;
  updateTeamVisions(world);
}

function keepOnlyCanister(mech: MechEntity): ReturnType<typeof canisterMount> {
  const mount = canisterMount(mech);
  mech.weapons = [mount];
  mech.ammoBins = mech.ammoBins.filter((bin) => bin.weaponId === mount.weaponId);
  mech.groupIntent.fill(false);
  mech.groupEnabled.fill(false);
  mech.groupIntent[mount.group - 1] = true;
  mech.groupEnabled[mount.group - 1] = true;
  return mount;
}

function graftCanister(world: World, mech: MechEntity): ReturnType<typeof canisterMount> {
  const donor = spawnDesign(world, 'redoubt_emplacement', mech.team, { x: 20, y: 20 });
  const donorMount = canisterMount(donor);
  const donorBin = donor.ammoBins.find((bin) => bin.weaponId === donorMount.weaponId);
  if (donorBin === undefined) throw new Error('missing Canister Cannon ammunition');
  const mount = structuredClone(donorMount);
  mech.weapons = [mount];
  mech.ammoBins = [structuredClone(donorBin)];
  mech.groupIntent.fill(false);
  mech.groupEnabled.fill(false);
  mech.groupIntent[mount.group - 1] = true;
  mech.groupEnabled[mount.group - 1] = true;
  return mount;
}

function makeSlugHot(world: World): void {
  const weapon = structuredClone(world.catalog.weapons.get('lbx_ac10'));
  if (weapon === undefined) throw new Error('missing Canister Cannon weapon');
  const slug = weapon.modes.find((mode) => mode.id === 'slug');
  if (slug === undefined) throw new Error('missing slug mode');
  slug.damage = 24;
  slug.accuracy = 0.55;
  slug.heat = 12;
  slug.cooldown = 0.75;
  world.catalog = {
    ...world.catalog,
    weapons: new Map(world.catalog.weapons).set(weapon.id, weapon),
  };
}

describe('tactical fire-mode integration', () => {
  it('selects for an immobile Redoubt before its heat governor runs', () => {
    const world = openWorld('tactical-fire-mode-immobile');
    const redoubt = spawnDesign(world, 'redoubt_emplacement', 0, { x: 100, y: 100 });
    const target = spawnDesign(world, 'sentinel_brawler', 1, { x: 280, y: 100 });
    const mount = keepOnlyCanister(redoubt);
    isolateOpticalDuel(world, redoubt, target);
    makeSlugHot(world);
    redoubt.heat = redoubt.heatCapacity * 0.8;
    mount.cooldown = 10;

    expect(isImmobile(redoubt)).toBe(true);
    applyHeatGovernor(world, redoubt, false);
    expect(redoubt.groupEnabled[mount.group - 1]).toBe(true);
    redoubt.ai.coolingDown = false;
    redoubt.groupEnabled[mount.group - 1] = true;

    decideTactical(world, redoubt, target.id, difficultyTier(world, 'regular'));

    expect(redoubt.targetId).toBe(target.id);
    expect(mount.modeId).toBe('slug');
    expect(redoubt.groupEnabled[mount.group - 1]).toBe(false);
  });

  it('selects the optical target range on the mobile tactical path', () => {
    const world = openWorld('tactical-fire-mode-mobile');
    const mech = unitOf(world, 'sentinel_brawler');
    const target = world.entities.find((candidate) => candidate.team !== mech.team);
    if (target === undefined) throw new Error('missing mobile-path target');
    const mount = graftCanister(world, mech);
    isolateOpticalDuel(world, mech, target);

    expect(isImmobile(mech)).toBe(false);
    expect(mount.modeId).toBe('cluster');
    decideTactical(world, mech, target.id, difficultyTier(world, 'regular'));

    expect(mech.targetId).toBe(target.id);
    expect(mount.modeId).toBe('slug');
  });

  it('does not select a mode from an indirect coarse contact', () => {
    const world = openWorld('tactical-fire-mode-private');
    world.rules = {
      ...world.rules,
      ai: {
        ...world.rules.ai,
        fireModes: {
          ...world.rules.ai.fireModes,
          lbx_ac10: { short: 'cluster', medium: 'cluster', long: 'cluster' },
        },
      },
    };
    const battery = unitOf(world, 'cairn_battery');
    const target = world.entities.find((candidate) => candidate.team !== battery.team);
    if (target === undefined) throw new Error('missing indirect target');
    const donor = spawnDesign(world, 'redoubt_emplacement', battery.team, { x: 20, y: 20 });
    const donorMount = canisterMount(donor);
    const mount = structuredClone(donorMount);
    mount.modeId = 'slug';
    battery.weapons.push(mount);
    battery.pos = { x: 100, y: 100 };
    world.entities = [battery, target];
    const vision = visionFor(world, battery.team);
    if (vision === null) throw new Error('missing controller vision');
    vision.visible.clear();
    vision.identified.clear();
    vision.detected.clear();
    vision.tracks.clear();
    const track: ContactTrack = {
      id: target.id,
      team: target.team,
      frame: target.frame,
      chassisClass: target.chassisClass,
      pos: { x: 150, y: 100 },
      tick: world.tick,
      source: 'sensor',
    };
    vision.detected.add(target.id);
    vision.tracks.set(target.id, track);

    decideTactical(world, battery, null, difficultyTier(world, 'regular'));

    expect(battery.targetId).toBe(target.id);
    expect(battery.calledShot).toBeNull();
    expect(mount.modeId).toBe('slug');
  });

  it('applies the same optical policy through either team controller', () => {
    const outcomes = [0, 1].map((team) => {
      const world = openWorld(`tactical-fire-mode-team-${team}`);
      const redoubt = spawnDesign(world, 'redoubt_emplacement', team, { x: 100, y: 100 });
      const target = spawnDesign(world, 'sentinel_brawler', 1 - team, { x: 280, y: 100 });
      const mount = keepOnlyCanister(redoubt);
      redoubt.controller = 'tactical';
      target.controller = 'orders';
      isolateOpticalDuel(world, redoubt, target);

      runTeamAi(world, team, difficultyTier(world, 'regular'));
      return { targetSelected: redoubt.targetId === target.id, modeId: mount.modeId };
    });

    expect(outcomes).toEqual([
      { targetSelected: true, modeId: 'slug' },
      { targetSelected: true, modeId: 'slug' },
    ]);
  });
});
