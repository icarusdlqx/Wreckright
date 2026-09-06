import { Group } from 'three';
import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { RepairTruckEffects } from './repairTruckEffects';

function setup(reduced = false) {
  const world = playerWorld('repair-service-animation');
  const ally = world.entities.find(entity => entity.team === 0)!;
  ally.locations.centre_torso.armour -= 35;
  const at = { ...ally.pos };
  const effects = new RepairTruckEffects(() => 0, id => world.entities.find(e => e.id === id)?.pos ?? null, reduced);
  const object = (name: string) => effects.group.getObjectByName(name)!;
  const end = 60 + Math.round(world.rules.support.repair_truck.durationSeconds / world.dt);
  const active = { team: 0, pos: at, radius: world.rules.support.repair_truck.radius,
    armourPerSecond: world.rules.support.repair_truck.armourPerSecond, expiresTick: end };
  return { world, ally, at, effects, object, active };
}

describe('delivered repair vehicle presentation', () => {
  it('arrives before service, parks beside the mech, works in the exact circle and departs after expiry', () => {
    const { world, ally, at, effects, object, active } = setup();
    const entities = structuredClone(world.entities);
    world.tick = 45;
    world.support.pending.push({ call: 'repair_truck', team: 0, target: at, heading: 0, resolveTick: 60 });
    effects.draw(world, 0.1);
    const vehicle = object('repair-vehicle-0');
    expect(vehicle.visible).toBe(true);
    expect(vehicle.position.y).toBeGreaterThan(0);
    expect(object('repair-airlift-0').visible).toBe(true);
    expect(object('support-repair-link-0-0').visible).toBe(false);
    world.tick = 60;
    world.support.pending = [];
    world.support.trucks.push(active);
    effects.draw(world, 0.1);
    expect(vehicle.position.y).toBe(0);
    expect(Math.hypot(vehicle.position.x, vehicle.position.z)).toBeGreaterThan(20);
    expect(object('support-repair-truck-0').position.x).toBe(at.x);
    expect(object('support-repair-radius-0').scale.x).toBe(active.radius);
    expect(object('support-repair-link-0-0').visible).toBe(true);
    expect(object('repair-airlift-0').visible).toBe(false);
    expect(world.entities).toEqual(entities);
    expect(ally.locations.centre_torso.armour).toBe(entities.find(e => e.id === ally.id)!.locations.centre_torso.armour);
    world.tick = active.expiresTick;
    world.support.trucks = [];
    effects.draw(world, 0.3);
    expect(vehicle.position.y).toBeGreaterThan(0);
    expect(object('support-repair-link-0-0').visible).toBe(false);
    expect(object('support-repair-radius-0').visible).toBe(false);
    expect(object('repair-airlift-0').visible).toBe(true);
    effects.draw(world, 1);
    expect(object('support-repair-truck-0').visible).toBe(false);
    effects.dispose();
  });

  it('freezes service animation with presentation time and only links plates needing repair', () => {
    const { world, ally, effects, object, active } = setup();
    world.support.trucks.push(active); world.tick = 100;
    effects.draw(world, 0.4);
    const beacon = object('repair-beacon-0').scale.x;
    effects.draw(world, 0);
    expect(object('repair-beacon-0').scale.x).toBe(beacon);
    ally.locations.centre_torso.armour = ally.locations.centre_torso.armourMax;
    effects.draw(world, 0.1);
    expect(object('support-repair-link-0-0').visible).toBe(false);
    effects.dispose();
  });

  it('keeps reduced-motion service readable without airlift movement or pulsing', () => {
    const { world, at, effects, object, active } = setup(true);
    world.tick = 50;
    world.support.pending.push({ call: 'repair_truck', team: 0, target: at, heading: 0, resolveTick: 60 });
    effects.draw(world, 0.1);
    expect(object('repair-vehicle-0').visible).toBe(false);
    world.tick = 60; world.support.pending = []; world.support.trucks.push(active);
    effects.draw(world, 0.1);
    expect(object('repair-vehicle-0').visible).toBe(true);
    expect(object('repair-beacon-0').scale.x).toBe(1);
    expect(object('support-repair-link-0-0').visible).toBe(true);
    world.support.trucks = []; effects.draw(world, 0);
    expect(object('support-repair-truck-0').visible).toBe(false);
    effects.dispose();
  });

  it('bounds busy support scenes and never presents hidden enemy service vehicles', () => {
    const { world, effects, object, active } = setup();
    const count = effects.group.children.length;
    world.support.trucks.push({ ...active, team: 1 });
    effects.draw(world, 0.1);
    expect(object('support-repair-truck-0').visible).toBe(false);
    world.support.trucks = Array.from({ length: 50 }, (_, i) => ({ ...active, expiresTick: active.expiresTick + i }));
    for (let frame = 0; frame < 20; frame++) effects.draw(world, 0.1);
    expect(effects.group.children).toHaveLength(count);
    expect(effects.group.children.filter(node => node instanceof Group && node.visible)).toHaveLength(4);
    effects.dispose(); effects.dispose();
    expect(effects.group.children).toHaveLength(0);
  });
});
