import { describe, expect, it } from 'vitest';
import { catalog, makeGrid, OPEN_LEGEND, playerWorld } from '../../tests/support';
import { createMech } from './entity';
import { applyHeatGovernor, restoreIntent } from './governor';
import { updateWeapons } from './combat';
import { updateHeat } from './heat';
import { setGroupEnabled, setHoldFire } from './orders';
import { updateTeamVisions } from './sensors';
import { usableWeapon } from './weaponEngagement';

function emitterBench() {
  const world = playerWorld('governor-emitter-bench');
  world.tick = 1;
  const source = catalog.designs.get('halberd_prime');
  if (source === undefined) throw new Error('missing test hull');
  const design = structuredClone(source);
  design.heatSinkId = 'double_heat_sink';
  design.mounts = [
    { weaponId: 'er_ppc', location: 'left_arm' },
    { weaponId: 'large_laser', location: 'left_arm' },
    { weaponId: 'er_ppc', location: 'right_arm' },
    { weaponId: 'large_laser', location: 'right_arm' },
    { weaponId: 'medium_laser', location: 'centre_torso' },
  ];
  design.ammo = [];
  design.equipment = [];
  const mech = createMech(catalog, catalog.rules, {
    id: 1, team: 0, designId: design.id, design, pilotId: 'kessa_vale',
    spawn: { x: 100, y: 100 }, facingDegrees: 0,
  });
  const target = createMech(catalog, catalog.rules, {
    id: 2, team: 1, designId: 'colossus_siege', pilotId: 'kessa_vale',
    spawn: { x: 150, y: 100 }, facingDegrees: 180,
  });
  world.terrain = makeGrid({ tiles: Array.from({ length: 30 }, () => '.'.repeat(30)), legend: OPEN_LEGEND });
  world.entities = [mech, target];
  mech.targetId = target.id;
  updateTeamVisions(world);
  return { world, mech, target };
}

function safetyHeat(world: ReturnType<typeof emitterBench>['world'], capacity: number): number {
  return capacity * (world.rules.heat.tiers.find(t => t.forcedShutdown || t.shutdownChancePerSecond > 0)?.fraction ?? 1);
}

describe('individual emitter scheduling inside player weapon groups', () => {
  it('fires a safe partial volley from cold when the full energy group cannot fit', () => {
    const { world, mech } = emitterBench();
    applyHeatGovernor(world, mech, false);
    expect(mech.groupIntent).toEqual([true, true, true, true]);
    expect(mech.groupEnabled[0]).toBe(true);
    expect(mech.weapons.some(mount => mount.governorBlocked)).toBe(true);
    updateWeapons(world, mech);
    expect(mech.stats.shotsFired).toBeGreaterThan(0);
    expect(mech.heat).toBeLessThan(safetyHeat(world, mech.heatCapacity));
  });

  it('lets every ready emitter cycle over time without crossing shutdown headroom', () => {
    const run = () => {
      const { world, mech } = emitterBench();
      const shots = mech.weapons.map(() => 0);
      for (let tick = 1; tick <= world.rules.simulation.tickRate * 30; tick += 1) {
        world.tick = tick;
        updateHeat(world, mech);
        if ((tick - 1) % world.rules.simulation.aiDecisionIntervalTicks === 0) applyHeatGovernor(world, mech, false);
        const before = mech.weapons.map(mount => mount.cooldown);
        updateWeapons(world, mech);
        mech.weapons.forEach((mount, index) => {
          if (mount.cooldown > (before[index] ?? 0)) shots[index] = (shots[index] ?? 0) + 1;
        });
        expect(mech.heat).toBeLessThan(safetyHeat(world, mech.heatCapacity));
        expect(mech.shutdownRemaining).toBe(0);
      }
      return { shots, heat: mech.heat, stats: mech.stats };
    };
    const once = run();
    expect(once.shots.every(count => count >= 2), JSON.stringify(once.shots)).toBe(true);
    expect(run()).toEqual(once);
  });

  it('respects destroyed guns, group intent and cooldowns', () => {
    const { world, mech } = emitterBench();
    mech.weapons[0]!.destroyed = true;
    mech.weapons[1]!.cooldown = 10;
    applyHeatGovernor(world, mech, false);
    updateWeapons(world, mech);
    expect(mech.weapons[0]!.cooldown).toBe(0);
    expect(mech.weapons[1]!.cooldown).toBeCloseTo(10 - world.dt);
    setGroupEnabled(mech, 1, false);
    applyHeatGovernor(world, mech, false);
    const shots = mech.stats.shotsFired;
    updateWeapons(world, mech);
    expect(mech.stats.shotsFired).toBe(shots);
    expect(usableWeapon(world, mech, mech.weapons[2]!, 'intent')).toBeNull();
  });

  it('restores throttled mounts when safety is released and keeps disabled groups disabled', () => {
    const { world, mech } = emitterBench();
    applyHeatGovernor(world, mech, false);
    expect(mech.weapons.some(mount => mount.governorBlocked)).toBe(true);
    setGroupEnabled(mech, 2, false);
    restoreIntent(mech);
    expect(mech.weapons.every(mount => !mount.governorBlocked && mount.governorWaitTicks === 0)).toBe(true);
    expect(mech.groupEnabled[1]).toBe(false);
    setHoldFire(mech, true);
    applyHeatGovernor(world, mech, false);
    updateWeapons(world, mech);
    expect(mech.stats.shotsFired).toBe(0);
  });

  it('does not turn a throttle into a range override or block an explicit alpha strike', () => {
    const { world, mech, target } = emitterBench();
    applyHeatGovernor(world, mech, false);
    target.pos = { x: 2000, y: 100 };
    updateWeapons(world, mech);
    expect(mech.stats.shotsFired).toBe(0);
    target.pos = { x: 150, y: 100 };
    mech.alphaUntilTick = world.tick + 1;
    updateWeapons(world, mech);
    expect(mech.stats.shotsFired).toBe(mech.weapons.length);
  });
});
