import { describe, expect, it } from 'vitest';
import { testWorld } from '../../tests/support';
import { toResult } from './battleResult';

describe('toResult', () => {
  it('reports whole armour and structure points, rounded in the mech\'s favour', () => {
    const world = testWorld('rounding');
    const mech = world.entities[0];
    if (mech === undefined) throw new Error('need a mech');
    mech.locations.left_arm.armour = 12.3;
    mech.locations.centre_torso.rearArmour = 3.01;
    mech.locations.right_leg.internal = 7.999;
    mech.locations.left_torso.armour = 0;

    const unit = toResult(world, 'rounding', 100).units.find((entry) => entry.id === mech.id);
    expect(unit?.condition.left_arm.armour).toBe(13);
    expect(unit?.condition.centre_torso.rearArmour).toBe(4);
    expect(unit?.condition.right_leg.internal).toBe(8);
    expect(unit?.condition.left_torso.armour).toBe(0);
    for (const condition of Object.values(unit?.condition ?? {})) {
      expect(Number.isInteger(condition.armour)).toBe(true);
      expect(Number.isInteger(condition.rearArmour)).toBe(true);
      expect(Number.isInteger(condition.internal)).toBe(true);
    }
  });
});
