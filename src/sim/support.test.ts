import { describe, expect, it } from 'vitest';
import { LOCATIONS } from '../schema/common';
import { playerWorld, spawnDesign, unitOf } from '../../tests/support';
import { supportHitTable, topUpArmour, updateSupport } from './support';

function armourTotal(entity: ReturnType<typeof unitOf>): number {
  return LOCATIONS.reduce((total, location) => {
    const state = entity.locations[location];
    return total + state.armour + state.rearArmour;
  }, 0);
}

describe('repair truck armour budget', () => {
  it('shares one budget fairly between front and rear plates', () => {
    const world = playerWorld('repair-sharing');
    const mech = unitOf(world, 'bulwark_assault');
    const arm = mech.locations.left_arm;
    const torso = mech.locations.centre_torso;
    arm.armour -= 20;
    torso.rearArmour -= 20;

    expect(topUpArmour(mech, 14)).toBeCloseTo(14);
    expect(arm.armour).toBeCloseTo(arm.armourMax - 13);
    expect(torso.rearArmour).toBeCloseTo(torso.rearArmourMax - 13);
  });

  it('redistributes unused shares and never repairs a destroyed location', () => {
    const world = playerWorld('repair-destroyed');
    const mech = unitOf(world, 'bulwark_assault');
    const arm = mech.locations.left_arm;
    const torso = mech.locations.centre_torso;
    const destroyed = mech.locations.right_torso;
    arm.armour -= 2;
    torso.rearArmour -= 20;
    destroyed.destroyed = true;
    destroyed.armour = 0;
    destroyed.rearArmour = 0;

    expect(topUpArmour(mech, 10)).toBeCloseTo(10);
    expect(arm.armour).toBe(arm.armourMax);
    expect(torso.rearArmour).toBeCloseTo(torso.rearArmourMax - 12);
    expect(destroyed.armour).toBe(0);
    expect(destroyed.rearArmour).toBe(0);
  });

  it('spends no more than the authored per-tick total', () => {
    const world = playerWorld('repair-rate');
    const mech = unitOf(world, 'wisp_scout');
    mech.locations.left_arm.armour = 0;
    mech.locations.centre_torso.rearArmour = 0;
    for (const other of world.entities) other.pos = { x: 900, y: 900 };
    mech.pos = { x: 200, y: 200 };
    const rate = world.rules.support.repair_truck.armourPerSecond;
    world.support.trucks.push({
      team: mech.team,
      pos: { ...mech.pos },
      radius: 1,
      armourPerSecond: rate,
      expiresTick: world.tick + 2,
    });
    const before = armourTotal(mech);

    updateSupport(world);

    expect(armourTotal(mech) - before).toBeCloseTo(rate * world.dt);
  });
});

describe('support overhead hit locations', () => {
  it('uses only locations active on the target frame', () => {
    const world = playerWorld('support-frames');
    const mech = unitOf(world, 'wisp_scout');
    const vehicle = spawnDesign(world, 'courser_patrol');
    const turret = spawnDesign(world, 'redoubt_emplacement');

    expect(supportHitTable(world, mech).map((entry) => entry.value)).toContain('left_arm');
    expect(supportHitTable(world, vehicle).map((entry) => entry.value)).not.toContain('left_arm');
    expect(supportHitTable(world, vehicle).map((entry) => entry.value)).toContain('left_leg');
    expect(supportHitTable(world, turret).map((entry) => entry.value)).not.toContain('left_arm');
    expect(supportHitTable(world, turret).map((entry) => entry.value)).not.toContain('left_leg');
    expect(supportHitTable(world, turret).map((entry) => entry.value)).toContain('centre_torso');
  });
});
