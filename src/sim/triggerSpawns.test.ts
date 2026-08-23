import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { spawnUnits } from './triggers';
import { createWorld } from './world';

const reinforcement = {
  designId: 'hornet_spotter',
  pilotId: 'marek_sud',
  spawn: { x: 480, y: 480 },
  facingDegrees: 0,
};

describe('trigger reinforcements', () => {
  it('inherits its side controller and difficulty-adjusted awareness', () => {
    const green = createWorld(catalog, {
      seed: 'trigger-green',
      missionId: 'skirmish_ridge',
      playerTeam: 0,
      enemyController: 'baseline',
      difficulty: 'green',
    });
    const elite = createWorld(catalog, {
      seed: 'trigger-elite',
      missionId: 'skirmish_ridge',
      playerTeam: 0,
      enemyController: 'baseline',
      difficulty: 'elite',
    });

    const greenScout = spawnUnits(green, 1, [reinforcement])[0];
    const eliteScout = spawnUnits(elite, 1, [reinforcement])[0];
    if (greenScout === undefined || eliteScout === undefined) throw new Error('spawn failed');

    expect(greenScout.controller).toBe('baseline');
    expect(eliteScout.controller).toBe('baseline');
    expect(eliteScout.pilot.sensors).toBeGreaterThan(greenScout.pilot.sensors);
    expect(eliteScout.sensorRange).toBeGreaterThan(greenScout.sensorRange);
    expect(eliteScout.sightRange).toBeGreaterThan(greenScout.sightRange);
  });

  it('keeps player reinforcements under orders at authored skill', () => {
    const world = createWorld(catalog, {
      seed: 'trigger-player',
      missionId: 'skirmish_ridge',
      playerTeam: 0,
      difficulty: 'elite',
    });
    const scout = spawnUnits(world, 0, [reinforcement])[0];
    const authored = catalog.pilots.get(reinforcement.pilotId);
    if (scout === undefined || authored === undefined) throw new Error('spawn failed');

    expect(scout.controller).toBe('orders');
    expect(scout.pilot.sensors).toBe(authored.sensors);
    expect(scout.pilot.gunnery).toBe(authored.gunnery);
  });
});
