import { describe, expect, it } from 'vitest';
import { makeGrid, OPEN_LEGEND, playerWorld, spawnDesign } from '../../tests/support';
import { intendedAttackApproach, intendedEngagementRange } from './attackApproach';
import { issueAttack, issueMove, setGroupEnabled, setHoldFire, setPosture, updatePlayerControl } from './orders';
import { updateTeamVisions } from './sensors';
import { distance } from './math';
import { stepWorld } from './world';

function field(design = 'rivet_escort', targetDesign = 'hornet_spotter') {
  const world = playerWorld('loadout-approach');
  world.terrain = makeGrid({ tiles: Array<string>(60).fill('.'.repeat(100)), legend: OPEN_LEGEND });
  world.entities = [];
  const shooter = spawnDesign(world, design, 0, { x: 105, y: 305 });
  const target = spawnDesign(world, targetDesign, 1, { x: 505, y: 305 });
  for (const unit of world.entities) {
    unit.controller = 'orders'; unit.autopilot = false; unit.sightRange = 1000;
  }
  setPosture(target, 'hold_position');
  setHoldFire(target, true);
  updateTeamVisions(world);
  return { world, shooter, target };
}

describe('loadout-aware Attack approach', () => {
  it('brings a stock Rivet into missile range and fires the short battery', () => {
    const { world, shooter, target } = field();
    const plan = intendedAttackApproach(world, shooter, target);
    expect(plan?.reachable).toBe(true);
    expect(plan!.range).toBeLessThan(150);
    expect(distance(plan!.point, target.pos)).toBeLessThan(180);
    expect(issueAttack(world, shooter, target.id, null)).toBe(true);
    for (let tick = 0; tick < 500; tick += 1) stepWorld(world, 2000);
    expect(world.events.some((event) => event.type === 'weapon_fired' &&
      event.shooterId === shooter.id && event.weaponId === 'srm6')).toBe(true);
  });

  it('keeps a long-range battery outside a brawler’s reach', () => {
    const { world, shooter, target } = field('trestle_battery', 'hornet_spotter');
    const plan = intendedAttackApproach(world, shooter, target);
    expect(plan!.range).toBeGreaterThanOrEqual(180);
    expect(distance(plan!.point, target.pos)).toBeGreaterThan(187.5);
    expect(plan!.range).toBeLessThanOrEqual(600);
  });

  it('excludes empty bins and held groups from the planned battery', () => {
    const { world, shooter, target } = field();
    const mixed = intendedEngagementRange(world, shooter, target)!;
    for (const bin of shooter.ammoBins) if (bin.weaponId === 'srm6') bin.rounds = 0;
    expect(intendedEngagementRange(world, shooter, target)).toBeGreaterThan(mixed);
    for (let group = 1; group <= 4; group += 1) setGroupEnabled(shooter, group, false);
    expect(intendedAttackApproach(world, shooter, target)).toBeNull();
  });

  it('does not override an explicit Move or Guard, or back away from chosen close ground', () => {
    const { world, shooter, target } = field();
    issueAttack(world, shooter, target.id, null);
    issueMove(world, shooter, { x: 105, y: 505 }, false);
    const move = structuredClone(shooter.orders.move);
    updatePlayerControl(world, shooter);
    expect(shooter.orders.move).toEqual(move);
    setPosture(shooter, 'hold_position');
    issueAttack(world, shooter, target.id, null);
    updatePlayerControl(world, shooter);
    expect(shooter.path).toEqual([]);
    shooter.pos = { x: 485, y: 305 };
    expect(intendedAttackApproach(world, shooter, target)?.needsMove).toBe(false);
  });

  it('returns no plan for an unseen contact and does not consume RNG or change orders', () => {
    const { world, shooter, target } = field();
    const before = JSON.stringify([shooter.orders, shooter.pos, shooter.ai, world.events]);
    const plan = intendedAttackApproach(world, shooter, target);
    expect(intendedAttackApproach(world, shooter, target)).toEqual(plan);
    expect(JSON.stringify([shooter.orders, shooter.pos, shooter.ai, world.events])).toBe(before);
    expect(world.rng.next()).toBe(field().world.rng.next());
    world.vision!.visible.delete(target.id);
    expect(intendedAttackApproach(world, shooter, target)).toBeNull();
  });

  it('reports a blocked approach when the firing band cannot be reached', () => {
    const { world, shooter, target } = field('hornet_spotter', 'hornet_spotter');
    world.terrain = makeGrid({ tiles: Array<string>(60).fill('.'.repeat(20) + '#'.repeat(10) + '.'.repeat(70)),
      legend: OPEN_LEGEND });
    const plan = intendedAttackApproach(world, shooter, target);
    expect(plan?.reachable).toBe(false);
    expect(plan?.point).toEqual(shooter.pos);
  });
});
