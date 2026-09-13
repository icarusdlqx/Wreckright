import { Group, Line, Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import type { World } from '../sim/types';
import { RepairTruckEffects } from './repairTruckEffects';

function fixture() {
  const world = playerWorld('optical-enemy-repair');
  const enemies = world.entities.filter(entity => entity.team !== world.playerTeam);
  const target = enemies[0]!;
  const hidden = enemies[1]!;
  target.pos = { x: 500, y: 400 };
  hidden.pos = { x: 515, y: 400 };
  target.locations.left_arm.armour = 0;
  hidden.locations.left_arm.armour = 0;
  world.vision!.visible.clear();
  world.vision!.visible.add(target.id);
  world.vision!.tiles.fill(0);
  const at = { x: 490, y: 400 };
  const tile = world.terrain.toTile(at);
  const cell = tile.row * world.terrain.width + tile.column;
  world.vision!.tiles[cell] = 1;
  world.support.trucks.push({ team: target.team, pos: at, radius: 45,
    armourPerSecond: world.rules.support.repair_truck.armourPerSecond, expiresTick: 600 });
  const effects = new RepairTruckEffects(() => 0, id =>
    world.vision!.visible.has(id) ? world.entities.find(entity => entity.id === id)?.pos ?? null : null, false);
  return { world, target, hidden, effects, cell };
}

function resourceCounts(root: Group) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse(child => {
    if (!(child instanceof Mesh || child instanceof Line)) return;
    geometries.add(child.geometry);
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
  });
  return { geometries: geometries.size, materials: materials.size };
}

describe('observed enemy field repairs', () => {
  it('shows the service truck and links to visible recipients without exposing its radius, timer or hidden recipients', () => {
    const { world, target, hidden, effects } = fixture();
    const before = JSON.stringify(world.support);
    effects.draw(world, 0);
    const truck = effects.group.getObjectByName('support-repair-truck-0')!;
    expect(truck.visible).toBe(true);
    expect(effects.group.getObjectByName('repair-vehicle-0')?.visible).toBe(true);
    expect(effects.group.getObjectByName('support-repair-radius-0')?.visible).toBe(false);
    expect(effects.group.getObjectByName('repair-service-clock-0')?.visible).toBe(false);
    const link = effects.group.getObjectByName('support-repair-link-0-0') as Line;
    expect(link.visible).toBe(true);
    expect(effects.group.getObjectByName('repair-weld-0-0')?.visible).toBe(true);
    expect(effects.group.getObjectByName('support-repair-link-0-1')?.visible).toBe(false);
    const end = link.geometry.getAttribute('position');
    expect(end.getX(2) + truck.position.x).toBe(target.pos.x);
    const parked = effects.group.getObjectByName('repair-vehicle-0')!.position.clone();
    hidden.pos = { x: 490, y: 400 };
    effects.draw(world, 0);
    expect(effects.group.getObjectByName('repair-vehicle-0')?.position.equals(parked)).toBe(true);
    expect(JSON.stringify(world.support)).toBe(before);
    effects.dispose();
  });

  it('removes all enemy activity immediately on lost optics, including when paused, and reuses its fixed resources on reacquisition', () => {
    const { world, effects, cell } = fixture();
    const budget = resourceCounts(effects.group);
    for (let cycle = 0; cycle < 8; cycle++) {
      world.vision!.tiles[cell] = 1;
      effects.draw(world, 0);
      expect(effects.group.getObjectByName('support-repair-truck-0')?.visible).toBe(true);
      world.vision!.tiles[cell] = cycle % 2 === 0 ? 0 : 2;
      effects.draw(world, 0);
      expect(effects.group.children.every(child => !child.visible)).toBe(true);
    }
    expect(resourceCounts(effects.group)).toEqual(budget);
    effects.dispose();
  });

  it('keeps incoming enemy plans private even on a visible tile and hides active support without player optics', () => {
    const { world, effects } = fixture();
    const truck = world.support.trucks.pop()!;
    world.support.pending.push({ call: 'repair_truck', team: truck.team, target: truck.pos,
      heading: 0, resolveTick: world.tick + 10 });
    effects.draw(world, 0);
    expect(effects.group.children.every(child => !child.visible)).toBe(true);
    world.support.pending.length = 0;
    world.support.trucks.push(truck);
    world.vision = null;
    effects.draw(world, 0);
    expect(effects.group.children.every(child => !child.visible)).toBe(true);
    effects.dispose();
  });

  it('never falls back to a hidden or unplaced enemy recipient position', () => {
    const { world, effects, target } = fixture();
    world.vision!.visible.delete(target.id);
    effects.draw(world, 0);
    expect(effects.group.getObjectByName('support-repair-truck-0')?.visible).toBe(true);
    expect(effects.group.getObjectByName('support-repair-link-0-0')?.visible).toBe(false);
    effects.dispose();
    const unplaced = new RepairTruckEffects(() => 0, () => null, false);
    world.vision!.visible.add(target.id);
    unplaced.draw(world, 0);
    expect(unplaced.group.getObjectByName('support-repair-link-0-0')?.visible).toBe(false);
    unplaced.dispose();
  });

  it('retains complete repair-zone information for the player and spectator', () => {
    const { world, effects } = fixture();
    world.support.trucks[0]!.team = world.playerTeam!;
    world.vision!.tiles.fill(0);
    effects.draw(world, 0);
    expect(effects.group.getObjectByName('support-repair-radius-0')?.visible).toBe(true);
    expect(effects.group.getObjectByName('repair-service-clock-0')?.visible).toBe(true);
    effects.dispose();
    const spectatorWorld = { ...world, playerTeam: null } as World;
    spectatorWorld.support.trucks[0]!.team = 1;
    const spectator = new RepairTruckEffects(() => 0, () => null, true);
    spectator.draw(spectatorWorld, 0);
    expect(spectator.group.getObjectByName('support-repair-radius-0')?.visible).toBe(true);
    expect(spectator.group.getObjectByName('support-repair-link-0-1')?.visible).toBe(true);
    spectator.dispose();
  });
});
