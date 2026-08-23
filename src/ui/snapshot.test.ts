import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import type { ContactTrack } from '../sim/sensors';
import { snapshotUnit, snapshotUnits } from './snapshot';

function hideAll(world: ReturnType<typeof playerWorld>): void {
  const vision = world.vision;
  if (vision === null) throw new Error('player world has no vision');
  vision.visible.clear();
  vision.identified.clear();
  vision.detected.clear();
  vision.tracks.clear();
}

describe('privacy-safe battle snapshots', () => {
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
    expect(sighted.targetName).toBe('SECRET LOST TARGET');
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
