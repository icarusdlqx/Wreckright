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

  it('omits hidden damage and death until an observed hulk justifies the exact name', () => {
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
    expect(eventLogLine(world, event)).toContain('SECRET HIDDEN ENEMY');
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
