import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import {
  canPresentEntity,
  canPresentSupportCall,
  PRESENTED_HULK_LIMIT,
} from './visibilityPresentation';

describe('hostile support presentation boundary', () => {
  it('telegraphs offensive calls on optically visible ground without exposing private support', () => {
    const world = playerWorld('hostile-support-presentation');
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    const player = world.entities.find((entity) => entity.team === vision.team);
    if (player === undefined) throw new Error('mission has no player unit');
    const target = {
      x: world.terrain.width * world.terrain.tileSize - 10,
      y: 10,
    };
    const tile = world.terrain.toTile(target);
    const cell = tile.row * world.terrain.width + tile.column;
    const pending = {
      call: 'artillery_strike' as const,
      team: vision.team + 1,
      target,
      heading: 0,
      resolveTick: 100,
    };

    vision.tiles.fill(0);
    expect(canPresentSupportCall(world, pending)).toBe(false);
    vision.tiles[cell] = 1;
    expect(canPresentSupportCall(world, pending)).toBe(true);
    expect(canPresentSupportCall(world, { ...pending, call: 'air_strike' })).toBe(true);
    expect(canPresentSupportCall(world, { ...pending, call: 'sensor_probe' })).toBe(false);
    expect(canPresentSupportCall(world, { ...pending, call: 'repair_truck' })).toBe(false);
  });

  it('warns when a fogged call centre still puts a player inside the damage envelope', () => {
    const world = playerWorld('hostile-support-envelope');
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    const player = world.entities.find((entity) => entity.team === vision.team);
    if (player === undefined) throw new Error('mission has no player unit');
    for (const entity of world.entities) {
      if (entity.team === vision.team && entity.id !== player.id) entity.destroyed = true;
    }
    vision.tiles.fill(0);
    const enemyTeam = vision.team + 1;
    const artilleryReach = world.rules.support.artillery_strike.radius +
      world.rules.support.artillery_strike.scatter;
    const artillery = {
      call: 'artillery_strike' as const,
      team: enemyTeam,
      target: { x: player.pos.x + artilleryReach, y: player.pos.y },
      heading: 0,
      resolveTick: 100,
    };
    expect(canPresentSupportCall(world, artillery)).toBe(true);
    expect(canPresentSupportCall(world, {
      ...artillery,
      target: { x: player.pos.x + artilleryReach + 1, y: player.pos.y },
    })).toBe(false);

    const air = world.rules.support.air_strike;
    const halfLine = air.length / 2 - air.length / air.shots / 2;
    expect(canPresentSupportCall(world, {
      ...artillery,
      call: 'air_strike',
      target: { x: player.pos.x + halfLine + air.width / 2, y: player.pos.y },
    })).toBe(true);
  });
});

describe('exact entity presentation boundary', () => {
  it('does not turn explored ground into a wreck reveal', () => {
    const world = playerWorld('hidden-wreck-presentation');
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    const enemy = world.entities.find((entity) => entity.team !== vision.team);
    if (enemy === undefined) throw new Error('mission has no hostile');
    vision.visible.delete(enemy.id);
    vision.observedHulks.delete(enemy.id);
    enemy.destroyed = true;
    const tile = world.terrain.toTile(enemy.pos);
    vision.explored[tile.row * world.terrain.width + tile.column] = 1;

    expect(canPresentEntity(world, enemy.id)).toBe(false);
    vision.observedHulks.add(enemy.id);
    expect(canPresentEntity(world, enemy.id)).toBe(true);
  });

  it('bounds the presentation ledger for optically observed hulks', () => {
    const world = playerWorld('bounded-wreck-presentation');
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    const template = world.entities.find((entity) => entity.team !== vision.team);
    if (template === undefined) throw new Error('mission has no hostile');
    vision.visible.clear();
    vision.observedHulks.clear();
    const ids: number[] = [];
    for (let index = 0; index <= PRESENTED_HULK_LIMIT; index += 1) {
      const id = 10_000 + index;
      ids.push(id);
      world.entities.push({ ...template, id, destroyed: true, withdrawn: false });
      vision.observedHulks.add(id);
    }
    const first = ids[0];
    const last = ids.at(-1);
    if (first === undefined || last === undefined) throw new Error('missing hulk ids');

    expect(canPresentEntity(world, last)).toBe(true);
    expect(canPresentEntity(world, first)).toBe(false);
  });

  it('does not let observed withdrawals evict real wrecks from the hulk cap', () => {
    const world = playerWorld('withdrawals-outside-wreck-cap');
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    const template = world.entities.find((entity) => entity.team !== vision.team);
    if (template === undefined) throw new Error('mission has no hostile');
    vision.visible.clear();
    vision.observedHulks.clear();
    const wreckId = 20_000;
    world.entities.push({ ...template, id: wreckId, destroyed: true, withdrawn: false });
    vision.observedHulks.add(wreckId);
    expect(canPresentEntity(world, wreckId)).toBe(true);

    for (let index = 0; index < PRESENTED_HULK_LIMIT; index += 1) {
      const id = 21_000 + index;
      world.entities.push({ ...template, id, destroyed: false, withdrawn: true });
      vision.observedHulks.add(id);
    }

    expect(canPresentEntity(world, wreckId)).toBe(true);
  });
});
