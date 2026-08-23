import { describe, expect, it } from 'vitest';
import { makeGrid, OPEN_LEGEND, playerWorld, unitOf } from '../../../tests/support';
import { updateWeapons } from '../combat';
import { eventsOfType } from '../events';
import { visionFor } from '../sensors';
import { decideBaseline } from './baseline';

describe('baseline optical targeting', () => {
  it('does not let a nearer ridge contact mask a clear target', () => {
    const world = playerWorld('baseline-own-sight');
    const mech = unitOf(world, 'sentinel_brawler');
    const [blocked, clear] = world.entities.filter((entity) => entity.team !== mech.team);
    if (blocked === undefined || clear === undefined) throw new Error('need two enemies');
    const vision = visionFor(world, mech.team);
    if (vision === null) throw new Error('need a team vision');
    world.terrain = makeGrid({
      legend: OPEN_LEGEND,
      tiles: ['.........', '.........', '..b......', '.........', '.........'],
    });
    mech.pos = { x: 35, y: 25 };
    blocked.pos = { x: 5, y: 25 };
    clear.pos = { x: 75, y: 25 };
    vision.visible.clear();
    vision.visible.add(blocked.id);
    vision.visible.add(clear.id);

    decideBaseline(world, mech);
    expect(mech.targetId).toBe(clear.id);
    mech.facing = 0;
    mech.torsoOffset = 0;
    updateWeapons(world, mech);
    expect(
      eventsOfType(world.events, 'weapon_fired').some(
        (event) => event.shooterId === mech.id && event.targetId === clear.id,
      ),
    ).toBe(true);
  });
});
