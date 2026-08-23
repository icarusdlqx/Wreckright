import { describe, expect, it } from 'vitest';
import { makeGrid, OPEN_LEGEND, playerWorld, unitOf } from '../../../tests/support';
import { lineOfSight } from '../los';
import { visionFor } from '../sensors';
import { exposureAt } from './positioning';

describe('candidate exposure', () => {
  it('counts an indirect battery behind terrain but not its blocked direct guns', () => {
    const world = playerWorld('indirect-exposure');
    const mech = unitOf(world, 'wisp_scout');
    const battery = unitOf(world, 'bulwark_assault');
    world.terrain = makeGrid({
      legend: OPEN_LEGEND,
      tiles: ['...............b........................'],
    });
    battery.pos = { x: 5, y: 5 };
    mech.pos = { x: 305, y: 5 };
    const vision = visionFor(world, mech.team);
    if (vision === null) throw new Error('need a team vision');
    vision.visible.clear();
    vision.visible.add(battery.id);

    expect(lineOfSight(world.terrain, battery.pos, mech.pos).clear).toBe(false);
    expect(exposureAt(world, mech, mech.pos)).toBe(1);

    battery.weapons = battery.weapons.filter(
      (mount) =>
        world.catalog.weapons.get(mount.weaponId)?.tags.includes('indirect_fire') !== true,
    );
    expect(exposureAt(world, mech, mech.pos)).toBe(0);
  });
});
