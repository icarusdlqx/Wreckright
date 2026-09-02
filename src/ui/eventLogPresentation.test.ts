import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { eventLogLine } from './eventLogPresentation';

describe('combat log visibility', () => {
  it('distinguishes an empty sensor sweep from contacts found', () => {
    const world = playerWorld('sensor-sweep-log');
    const event = {
      type: 'support_resolved' as const,
      tick: world.tick,
      team: world.playerTeam ?? 0,
      call: 'sensor_probe',
      x: 200,
      y: 200,
      contactCount: 0,
    };

    expect(eventLogLine(world, event)).toBe('Sensor sweep — nothing in range');
    expect(eventLogLine(world, { ...event, contactCount: 1 })).toBe('Sensor sweep — 1 contact');
    expect(eventLogLine(world, { ...event, contactCount: 3 })).toBe('Sensor sweep — 3 contacts');
    expect(eventLogLine(world, { ...event, team: event.team + 1 })).toBeNull();
  });

  it('omits hidden damage and resolves an observed stock hulk through its stable id', () => {
    const world = playerWorld('private-combat-log');
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    const enemy = world.entities.find((entity) => entity.team !== vision.team);
    if (enemy === undefined) throw new Error('mission has no hostile');
    enemy.name = 'SECRET HIDDEN ENEMY';
    enemy.destroyed = true;
    vision.visible.delete(enemy.id);
    vision.observedHulks.delete(enemy.id);

    const event = {
      type: 'mech_destroyed' as const,
      tick: world.tick,
      entityId: enemy.id,
      method: 'centre_torso' as const,
    };
    expect(eventLogLine(world, event)).toBeNull();
    vision.observedHulks.add(enemy.id);
    const currentName = world.catalog.designs.get(enemy.designId)?.name;
    expect(currentName).toBeDefined();
    expect(eventLogLine(world, event)).toBe(`${currentName} destroyed — centre_torso`);
    expect(eventLogLine(world, event)).not.toContain('SECRET HIDDEN ENEMY');
  });

  it('ignores a stale spawn-event name when the stable design id is known', () => {
    const world = playerWorld('current-spawn-name');
    const entity = world.entities[0];
    if (entity === undefined) throw new Error('mission has no unit');
    entity.name = 'LEGACY SERIAL NAME';
    const currentName = world.catalog.designs.get(entity.designId)?.name;
    if (currentName === undefined) throw new Error('unit has no authored design');

    expect(eventLogLine(world, {
      type: 'unit_spawned',
      tick: world.tick,
      entityId: entity.id,
      team: entity.team,
      name: 'STALE EVENT NAME',
    })).toBe(`${currentName} arrives on the field`);
  });

  it('removes a legacy serial from an unkeyed mission message without touching weapon text', () => {
    const world = playerWorld('current-mission-message-name');

    expect(eventLogLine(world, {
      type: 'mission_message',
      tick: world.tick,
      text: "Sentinel SNL-2 'Brawler' has no route; AC/5 intact.",
    })).toBe("Sentinel 'Brawler' has no route; AC/5 intact.");
  });

  it('reports enemy support only when its target ground is optically visible', () => {
    const world = playerWorld('private-support-log');
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    vision.tiles.fill(0);
    const at = world.terrain.tileCentre(2, 2);
    const event = {
      type: 'support_resolved' as const,
      tick: world.tick,
      team: vision.team + 1,
      call: 'air_strike',
      x: at.x,
      y: at.y,
    };

    expect(eventLogLine(world, event)).toBeNull();
    vision.tiles[2 * world.terrain.width + 2] = 1;
    expect(eventLogLine(world, event)).toBe('air strike on target');
    expect(eventLogLine(world, { ...event, team: vision.team })).toBe('air strike on target');
  });
});
