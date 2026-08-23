import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { minimapBlips } from './Minimap';

describe('minimap contact privacy', () => {
  it('draws a sensor return at its coarse track rather than the hidden live position', () => {
    const world = playerWorld('sensor-minimap');
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    const enemy = world.entities.find((entity) => entity.team !== vision.team);
    if (enemy === undefined) throw new Error('mission has no hostile');
    vision.visible.clear();
    vision.detected.clear();
    vision.tracks.clear();
    enemy.pos = { x: 731, y: 619 };
    const coarse = { x: 504, y: 312 };
    vision.detected.add(enemy.id);
    vision.tracks.set(enemy.id, {
      id: enemy.id,
      team: enemy.team,
      frame: enemy.frame,
      chassisClass: enemy.chassisClass,
      pos: coarse,
      tick: world.tick,
      source: 'sensor',
    });

    const blip = minimapBlips(world).find((entry) => entry.id === enemy.id);
    expect(blip).toEqual({ id: enemy.id, team: enemy.team, position: coarse, kind: 'sensor' });
    expect(blip?.position).not.toEqual(enemy.pos);

    vision.visible.add(enemy.id);
    const optical = minimapBlips(world).find((entry) => entry.id === enemy.id);
    expect(optical?.kind).toBe('optical');
    expect(optical?.position).toEqual(enemy.pos);

    vision.visible.delete(enemy.id);
    vision.detected.delete(enemy.id);
    const memory = minimapBlips(world).find((entry) => entry.id === enemy.id);
    expect(memory).toEqual({ id: enemy.id, team: enemy.team, position: coarse, kind: 'memory' });
  });
});
