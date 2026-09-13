import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { playerWorld, unitOf } from '../../tests/support';
import { applyDamage } from '../sim/damage';
import { updateSupport } from '../sim/support';
import { HostileBar } from '../ui/ContactsBar';
import { buildCommanderViewModel } from '../ui/commanderViewModel';
import { unitIntegrity as lanceIntegrity } from '../ui/lanceCardState';
import { snapshotUnit, snapshotUnits } from '../ui/snapshot';
import { unitIntegrity } from './unitIntegrity';

describe('exact health through damage and field repair', () => {
  it('falls with damage and lost parts, but honestly rises with the authored enemy armour repair budget', () => {
    const world = playerWorld('enemy-health-recovery');
    const enemy = unitOf(world, 'halberd_prime');
    world.vision!.visible.add(enemy.id);
    const maximum = Object.values(enemy.locations).reduce((sum, part) => sum + part.armourMax + part.rearArmourMax + part.internalMax, 0);
    const health = () => unitIntegrity(enemy);
    const initial = health();
    applyDamage(world, enemy, 'left_arm', 20);
    const damaged = health();
    expect(damaged).toBeCloseTo(initial - 20 / maximum);
    const beforeRepair = structuredClone(enemy.locations);
    const rules = world.rules.support.repair_truck;
    world.support.trucks.push({ team: enemy.team, pos: { ...enemy.pos }, radius: rules.radius,
      armourPerSecond: rules.armourPerSecond, expiresTick: world.tick + 600 });
    for (let tick = 0; tick < 20; tick++) {
      world.tick++;
      updateSupport(world);
    }
    expect(health()).toBeCloseTo(damaged + rules.armourPerSecond / maximum);
    expect(enemy.locations.left_arm.internal).toBe(beforeRepair.left_arm.internal);
    const snapshot = snapshotUnit(world, enemy);
    expect(lanceIntegrity(snapshot)).toBeCloseTo(health());
    const commander = buildCommanderViewModel(world, { playerTeam: world.playerTeam!, selection: [], contacts: [] });
    expect(commander.chits.find(chit => chit.id === enemy.id)?.integrity).toBeCloseTo(health());
    const html = renderToStaticMarkup(createElement(HostileBar, { enemies: [snapshot], contacts: [],
      targetIds: new Set<number>(), hasSelection: true, onTarget: () => {}, onContact: () => {} }));
    expect(html).toContain(`${Math.round(health() * 100)}% armour / structure`);
    const repaired = health();
    applyDamage(world, enemy, 'left_arm', 5);
    expect(health()).toBeCloseTo(repaired - 5 / maximum);
    const beforeLoss = health();
    applyDamage(world, enemy, 'right_leg', enemy.locations.right_leg.armour + enemy.locations.right_leg.internal);
    expect(health()).toBeLessThan(beforeLoss);
    const lost = structuredClone(enemy.locations.right_leg);
    updateSupport(world);
    expect(enemy.locations.right_leg).toEqual(lost);
    world.vision!.visible.delete(enemy.id);
    expect(snapshotUnits(world, world.playerTeam!).enemies.some(unit => unit.id === enemy.id)).toBe(false);
  });
});
