import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { canPresentEntity, PRESENTED_HULK_LIMIT } from './visibilityPresentation';

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
