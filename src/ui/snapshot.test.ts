import { describe, expect, it } from 'vitest';
import { playerWorld, spawnDesign } from '../../tests/support';
import { createMech } from '../sim/entity';
import type { ContactTrack } from '../sim/sensors';
import { findAmmoBin } from '../sim/types';
import { snapshotUnit, snapshotUnits } from './snapshot';

function hideAll(world: ReturnType<typeof playerWorld>): void {
  const vision = world.vision;
  if (vision === null) throw new Error('player world has no vision');
  vision.visible.clear();
  vision.identified.clear();
  vision.detected.clear();
  vision.tracks.clear();
}

function enduranceCairn() {
  const world = playerWorld('refitted-cairn-ammunition');
  const design = structuredClone(world.catalog.designs.get('cairn_battery'));
  if (design === undefined) throw new Error('missing Cairn design');
  design.mounts = design.mounts.filter((mount) =>
    mount.weaponId !== 'streak_srm6' || mount.location !== 'right_torso');
  const longshot10 = design.ammo.find((bin) => bin.weaponId === 'lrm10');
  if (longshot10 === undefined) throw new Error('missing Longshot 10 bin');
  longshot10.tons = 5;
  design.ammo.push({ weaponId: 'lrm20', location: 'right_torso', tons: 2 });
  const unit = createMech(world.catalog, world.rules, {
    id: 999, team: 0, designId: design.id, design,
    pilotId: 'kessa_vale', spawn: { x: 480, y: 480 }, facingDegrees: 0,
  });
  world.entities.push(unit);
  return { world, unit };
}

describe('shared ammunition snapshots', () => {
  it('shows the full saved multi-bin Cairn loadout without combining different ammunition types', () => {
    const { world, unit } = enduranceCairn();
    const before = structuredClone(unit.ammoBins);
    expect(unit.ammoBins.filter((bin) => bin.weaponId === 'lrm20').map((bin) => bin.rounds))
      .toEqual([12, 6, 12]);
    expect(snapshotUnit(world, unit).weapons.map(({ name, rounds }) => ({ name, rounds })))
      .toEqual([
        { name: 'Longshot 20', rounds: 30 },
        { name: 'Longshot 10', rounds: 60 },
        { name: 'Seeker 6', rounds: 30 },
      ]);
    expect(unit.ammoBins).toEqual(before);
  });

  it('still reports later usable bins after the first bin empties', () => {
    const { world, unit } = enduranceCairn();
    const bins = unit.ammoBins.filter((bin) => bin.weaponId === 'lrm20');
    if (bins[0] === undefined || bins[1] === undefined) throw new Error('missing split bins');
    bins[0].rounds = 0;
    expect(findAmmoBin(unit, 'lrm20')).toBe(bins[1]);
    expect(snapshotUnit(world, unit).weapons.find((weapon) => weapon.name === 'Longshot 20')?.rounds)
      .toBe(18);
    for (const bin of bins) bin.rounds = 0;
    expect(findAmmoBin(unit, 'lrm20')).toBeNull();
    expect(snapshotUnit(world, unit).weapons.find((weapon) => weapon.name === 'Longshot 20')?.rounds)
      .toBe(0);
  });

  it('excludes destroyed bins even when their stored round count is positive', () => {
    const { world, unit } = enduranceCairn();
    const bins = unit.ammoBins.filter((bin) => bin.weaponId === 'lrm20');
    if (bins[0] === undefined || bins[1] === undefined) throw new Error('missing split bins');
    bins[0].destroyed = true;
    bins[1].destroyed = true;
    expect(bins[0].rounds + bins[1].rounds).toBe(18);
    expect(snapshotUnit(world, unit).weapons.find((weapon) => weapon.name === 'Longshot 20')?.rounds)
      .toBe(12);
  });

  it('shows the same shared reserve for twin weapons and no ammunition count for energy weapons', () => {
    const world = playerWorld('shared-and-energy-ammunition');
    const cairn = spawnDesign(world, 'cairn_battery', 0);
    expect(snapshotUnit(world, cairn).weapons.filter((weapon) => weapon.name === 'Seeker 6')
      .map((weapon) => weapon.rounds)).toEqual([30, 30]);
    const sentinel = spawnDesign(world, 'sentinel_brawler', 0);
    const energy = snapshotUnit(world, sentinel).weapons.filter((weapon) => {
      const mount = sentinel.weapons[weapon.index];
      return mount !== undefined && world.catalog.weapons.get(mount.weaponId)?.ammoPerTon === null;
    });
    expect(energy.length).toBeGreaterThan(0);
    expect(energy.every((weapon) => weapon.rounds === null)).toBe(true);
  });
});

describe('privacy-safe battle snapshots', () => {
  it('resolves a legacy entity name into the complete current battle identity', () => {
    const world = playerWorld('current-battle-identity');
    const unit = spawnDesign(world, 'hornet_spotter', 0);
    unit.name = "Gadfly GAD-2 'Spotter'";

    expect(snapshotUnit(world, unit)).toMatchObject({
      name: 'Gadfly',
      identity: 'Gadfly — 35t Light · Forward spotter · Linewrought',
    });
  });

  it('resolves the current and next fire mode cyclically from the live mount', () => {
    const world = playerWorld('fire-mode-snapshot');
    const unit = spawnDesign(world, 'redoubt_emplacement', 0);
    const mount = unit.weapons.find((entry) => entry.weaponId === 'lbx_ac10');
    if (mount === undefined) throw new Error('missing Canister Cannon mount');

    mount.modeId = 'cluster';
    expect(snapshotUnit(world, unit).weapons[mount.index]).toMatchObject({
      modeId: 'cluster',
      modeName: 'Cluster',
      nextModeId: 'slug',
      nextModeName: 'Slug',
    });

    mount.modeId = 'slug';
    expect(snapshotUnit(world, unit).weapons[mount.index]).toMatchObject({
      modeId: 'slug',
      modeName: 'Slug',
      nextModeId: 'cluster',
      nextModeName: 'Cluster',
    });

    const weapon = structuredClone(world.catalog.weapons.get('lbx_ac10'));
    const slug = weapon?.modes.find((mode) => mode.id === 'slug');
    if (weapon === undefined || slug === undefined) throw new Error('missing Slug profile');
    slug.cooldown = 5;
    world.catalog = {
      ...world.catalog,
      weapons: new Map(world.catalog.weapons).set(weapon.id, weapon),
    };
    mount.cooldown = 1;
    mount.cycleDuration = 3;
    expect(snapshotUnit(world, unit).weapons[mount.index]?.cooldownMax).toBe(3);
    mount.cooldown = 0;
    expect(snapshotUnit(world, unit).weapons[mount.index]?.cooldownMax).toBe(5);
  });

  it('serializes sensor-only returns from coarse tracks without hidden unit state', () => {
    const world = playerWorld('coarse-contact-snapshot');
    hideAll(world);
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    const hidden = world.entities.filter((entity) => entity.team !== vision.team).slice(0, 3);
    if (hidden.length < 3) throw new Error('mission needs three hostiles');

    hidden[0]!.name = 'SECRET CHASSIS NAME';
    hidden[0]!.pilot.name = 'SECRET PILOT';
    hidden[0]!.heat = 99;
    const tracks: ContactTrack[] = [
      {
        id: hidden[0]!.id, team: hidden[0]!.team, frame: 'mech', chassisClass: 'heavy',
        pos: { x: 504, y: 312 }, tick: world.tick, source: 'sensor',
      },
      {
        id: hidden[1]!.id, team: hidden[1]!.team, frame: 'vehicle', chassisClass: 'light',
        pos: { x: 552, y: 360 }, tick: world.tick, source: 'sensor',
      },
      {
        id: hidden[2]!.id, team: hidden[2]!.team, frame: 'turret', chassisClass: 'assault',
        pos: { x: 600, y: 408 }, tick: world.tick, source: 'sensor',
      },
    ];
    for (const track of tracks) {
      vision.detected.add(track.id);
      vision.tracks.set(track.id, track);
    }

    const snapshot = snapshotUnits(world, vision.team);
    expect(snapshot.enemies).toEqual([]);
    expect(snapshot.contacts.map((contact) => contact.label)).toEqual([
      'Heavy mech',
      'Light vehicle',
      'Emplacement contact',
    ]);
    const firstContact = snapshot.contacts[0];
    if (firstContact === undefined) throw new Error('missing coarse contact');
    expect(firstContact.position).toEqual(tracks[0]?.pos);
    expect(firstContact.approximateRange === null
      ? null
      : firstContact.approximateRange % 50).toBe(0);
    expect(Object.keys(firstContact).sort()).toEqual([
      'approximateRange', 'current', 'id', 'label', 'position', 'source', 'team',
    ]);
    const serialized = JSON.stringify(snapshot.contacts);
    expect(serialized).not.toContain('SECRET CHASSIS NAME');
    expect(serialized).not.toContain('SECRET PILOT');
    expect(serialized).not.toContain('heat');
    expect(serialized).not.toContain('weapon');
    expect(serialized).not.toContain('armour');
  });

  it('promotes an optical contact to a full enemy and drops its sensor card', () => {
    const world = playerWorld('optical-contact-snapshot');
    hideAll(world);
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    const enemy = world.entities.find((entity) => entity.team !== vision.team);
    if (enemy === undefined) throw new Error('mission has no hostile');
    vision.visible.add(enemy.id);
    vision.detected.add(enemy.id);
    vision.tracks.set(enemy.id, {
      id: enemy.id,
      team: enemy.team,
      frame: enemy.frame,
      chassisClass: enemy.chassisClass,
      pos: { x: 24, y: 24 },
      tick: world.tick,
      source: 'optical',
    });

    const snapshot = snapshotUnits(world, vision.team);
    expect(snapshot.contacts).toEqual([]);
    expect(snapshot.enemies.map((entry) => entry.id)).toContain(enemy.id);
  });

  it('does not serialize a friendly mech target after optical contact is lost', () => {
    const world = playerWorld('lost-target-snapshot');
    hideAll(world);
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    const friendly = world.entities.find((entity) => entity.team === vision.team);
    const enemy = world.entities.find((entity) => entity.team !== vision.team);
    if (friendly === undefined || enemy === undefined) throw new Error('missing test combatants');
    enemy.name = 'SECRET LOST TARGET';
    friendly.targetId = enemy.id;

    const hidden = snapshotUnit(world, friendly);
    expect(hidden.targetId).toBeNull();
    expect(hidden.targetName).toBeNull();
    expect(hidden.targetRange).toBeNull();

    vision.visible.add(enemy.id);
    const sighted = snapshotUnit(world, friendly);
    expect(sighted.targetId).toBe(enemy.id);
    expect(sighted.targetName).toBe(world.catalog.designs.get(enemy.designId)?.name);
    expect(sighted.targetName).not.toBe('SECRET LOST TARGET');
    expect(sighted.targetRange).not.toBeNull();
  });

  it('keeps a frozen contact until expiry without disclosing a hidden death', () => {
    const world = playerWorld('frozen-contact-snapshot');
    hideAll(world);
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    const enemy = world.entities.find((entity) => entity.team !== vision.team);
    if (enemy === undefined) throw new Error('mission has no hostile');
    const track: ContactTrack = {
      id: enemy.id,
      team: enemy.team,
      frame: enemy.frame,
      chassisClass: enemy.chassisClass,
      pos: { x: 504, y: 312 },
      tick: world.tick,
      source: 'sensor',
    };
    vision.detected.add(enemy.id);
    vision.tracks.set(enemy.id, track);
    expect(snapshotUnits(world, vision.team).contacts[0]?.current).toBe(true);

    enemy.destroyed = true;
    vision.detected.delete(enemy.id);
    const hiddenDeath = snapshotUnits(world, vision.team).contacts[0];
    expect(hiddenDeath).toMatchObject({ id: enemy.id, current: false, position: track.pos });

    vision.observedHulks.add(enemy.id);
    expect(snapshotUnits(world, vision.team).contacts).toEqual([]);
  });
});
