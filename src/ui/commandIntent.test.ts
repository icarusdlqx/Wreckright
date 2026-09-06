import { describe, expect, it, vi } from 'vitest';
import { makeGrid, OPEN_LEGEND, playerWorld, spawnDesign } from '../../tests/support';
import { atAttackRange } from '../sim/attackApproach';
import { distance } from '../sim/math';
import { issueAttack, issueMove, setGroupEnabled, setHoldFire, setPosture } from '../sim/orders';
import { updateTeamVisions } from '../sim/sensors';
import { findPath } from '../sim/pathfind';
import type { AudioDirector } from './audio';
import { selectedAttackIntent } from './attackIntent';
import { combatIntent } from './combatIntent';
import { buildFriendlyRouteMarkers } from './friendlyRouteMarkers';
import { buildFriendlyRouteMarkers as engineRoutes } from './enginePresentation';
import { stopSelection } from './engineOrders';
import { snapshotUnit } from './snapshot';

function field(design = 'rivet_escort', bent = false) {
  const world = playerWorld('command-intent-proof');
  const tiles = Array.from({ length: 60 }, (_, row) => bent && row < 38
    ? '.'.repeat(25) + '##' + '.'.repeat(73) : '.'.repeat(100));
  world.terrain = makeGrid({ tiles, legend: OPEN_LEGEND });
  world.entities = [];
  const shooter = spawnDesign(world, design, 0, { x: 105, y: 305 });
  const target = spawnDesign(world, 'hornet_spotter', 1, { x: 505, y: 305 });
  for (const entity of world.entities) {
    entity.controller = 'orders';
    entity.autopilot = false;
    entity.sightRange = 1000;
  }
  setPosture(target, 'hold_position');
  setHoldFire(target, true);
  updateTeamVisions(world);
  // Represents a teammate spotting across the obstacle while this mech takes the route around it.
  world.vision!.visible.add(target.id);
  if (!issueAttack(world, shooter, target.id, null)) throw new Error('fixture attack refused');
  return { world, shooter, target };
}

describe('friendly combat intent and route agreement', () => {
  it('draws the real bent approach only as far as its usable firing position', () => {
    const { world, shooter, target } = field('rivet_escort', true);
    const plan = selectedAttackIntent(world, shooter);
    expect(plan).toMatchObject({ needsMove: true, reachable: true });
    if (plan === null) throw new Error('missing approach');
    const selection = new Set([shooter.id]);
    const marker = buildFriendlyRouteMarkers(world, selection)[0]?.legs[0];
    if (marker === undefined) throw new Error('missing route marker');
    expect(marker.points[0]).toEqual(shooter.pos);
    expect(marker.points.at(-1)).toEqual(plan.point);
    expect(marker.points.at(-1)).not.toEqual(target.pos);
    expect(marker.points.some((point) => point.y > 375)).toBe(true);
    expect(atAttackRange(world, shooter, target, plan.range, plan.point)).toBe(true);
    const fullPath = findPath(world.terrain, shooter.pos, target.pos, world.rules.simulation.pathfindMaxNodes)!;
    expect(distance(plan.point, target.pos)).toBeGreaterThan(world.rules.movement.arrivalRadius);
    expect(fullPath.at(-1)).toEqual(target.pos);
    let length = 0;
    for (let index = 1; index < marker.points.length; index++) {
      const from = marker.points[index - 1]!;
      const to = marker.points[index]!;
      length += distance(from, to);
      const steps = Math.ceil(distance(from, to) / 2);
      for (let step = 0; step <= steps; step++) {
        const t = steps === 0 ? 0 : step / steps;
        const column = Math.floor((from.x + (to.x - from.x) * t) / world.terrain.tileSize);
        const row = Math.floor((from.y + (to.y - from.y) * t) / world.terrain.tileSize);
        expect(world.terrain.idAt(column, row)).not.toBe('impassable');
      }
    }
    expect(marker.cumulativeEtaSeconds).toBeCloseTo(length / shooter.walkSpeed);
    expect(combatIntent(world, snapshotUnit(world, shooter))?.label).toBe(`Closing to ${Math.round(plan.range)}m`);
    expect(engineRoutes(world, selection)).toEqual(buildFriendlyRouteMarkers(world, selection));
  });

  it('reuses one tick plan without modifying simulation state or random sequence, and copies marker points', () => {
    const { world, shooter } = field();
    const before = structuredClone({ orders: shooter.orders, pos: shooter.pos, path: shooter.path, ai: shooter.ai, events: world.events });
    const rng = world.rng.save();
    const plan = selectedAttackIntent(world, shooter);
    expect(plan?.needsMove).toBe(true);
    const selection = new Set([shooter.id]);
    for (let draw = 0; draw < 20; draw++) {
      expect(selectedAttackIntent(world, shooter)).toBe(plan);
      combatIntent(world, snapshotUnit(world, shooter));
      buildFriendlyRouteMarkers(world, selection);
    }
    expect(world.rng.save()).toEqual(rng);
    expect({ orders: shooter.orders, pos: shooter.pos, path: shooter.path, ai: shooter.ai, events: world.events }).toEqual(before);
    const markerPoint = buildFriendlyRouteMarkers(world, selection)[0]?.legs[0]?.points.at(-1);
    if (markerPoint === undefined || plan === null) throw new Error('missing plan');
    const stop = { ...plan.point };
    markerPoint.x += 300;
    expect(selectedAttackIntent(world, shooter)?.point).toEqual(stop);
    expect(shooter.path).toEqual(before.path);
  });

  it('changes the planned battery immediately when a weapon group is disabled while paused', () => {
    const { world, shooter } = field();
    const initial = selectedAttackIntent(world, shooter);
    const shortGun = shooter.weapons.find((weapon) => weapon.weaponId === 'srm6');
    if (shortGun === undefined) throw new Error('Rivet fixture has no short battery');
    setGroupEnabled(shooter, shortGun.group, false);
    const revised = selectedAttackIntent(world, shooter);
    expect(revised).not.toBe(initial);
    expect(revised?.range).not.toBe(initial?.range);
    expect(world.tick).toBe(0);
  });

  it('keeps an explicit Move authoritative over an assigned attack, then honours Guard and Hold Fire', () => {
    const { world, shooter, target } = field('hornet_spotter');
    const snapshotBeforeOrder = snapshotUnit(world, shooter);
    expect(selectedAttackIntent(world, shooter)?.needsMove).toBe(true);
    const destination = { x: 105, y: 505 };
    expect(issueMove(world, shooter, destination, true)).toBe(true);
    expect(issueAttack(world, shooter, target.id, null)).toBe(true);
    expect(selectedAttackIntent(world, shooter)).toBeNull();
    expect(combatIntent(world, snapshotBeforeOrder)?.label).toBe('Following your route');
    expect(buildFriendlyRouteMarkers(world, new Set([shooter.id]))[0]?.legs[0]).toMatchObject({ run: true });
    expect(buildFriendlyRouteMarkers(world, new Set([shooter.id]))[0]?.legs[0]?.points.at(-1)).toEqual(destination);
    const snapshotWhileMoving = snapshotUnit(world, shooter);
    setPosture(shooter, 'hold_position');
    expect(selectedAttackIntent(world, shooter)).toBeNull();
    expect(buildFriendlyRouteMarkers(world, new Set([shooter.id]))).toEqual([]);
    expect(combatIntent(world, snapshotWhileMoving)?.label).not.toBe('Following your route');
    expect(combatIntent(world, snapshotBeforeOrder)?.detail).toContain('Guard');
    setPosture(shooter, 'free');
    setHoldFire(shooter, true);
    expect(selectedAttackIntent(world, shooter)).toBeNull();
    expect(buildFriendlyRouteMarkers(world, new Set([shooter.id]))).toEqual([]);
    expect(combatIntent(world, snapshotBeforeOrder)?.label).toBe('Holding fire');
  });

  it('removes an old attack approach on explicit Stop and shows no approach for an in-range target', () => {
    const { world, shooter, target } = field();
    expect(selectedAttackIntent(world, shooter)?.needsMove).toBe(true);
    stopSelection({ world, audio: { order: vi.fn() } as unknown as AudioDirector, selectedEntities: () => [shooter.id] });
    expect(shooter.orders.attack).toBeNull();
    expect(selectedAttackIntent(world, shooter)).toBeNull();
    expect(buildFriendlyRouteMarkers(world, new Set([shooter.id]))).toEqual([]);
    shooter.pos = { x: target.pos.x - 30, y: target.pos.y };
    world.tick++;
    issueAttack(world, shooter, target.id, null);
    expect(selectedAttackIntent(world, shooter)?.needsMove).toBe(false);
    expect(buildFriendlyRouteMarkers(world, new Set([shooter.id]))).toEqual([]);
  });

  it('reports a blocked route without drawing a false straight line through the obstacle', () => {
    const { world, shooter } = field('hornet_spotter');
    world.terrain = makeGrid({ tiles: Array<string>(60).fill('.'.repeat(20) + '#'.repeat(10) + '.'.repeat(70)), legend: OPEN_LEGEND });
    expect(selectedAttackIntent(world, shooter)).toMatchObject({ needsMove: true, reachable: false, path: [] });
    expect(buildFriendlyRouteMarkers(world, new Set([shooter.id]))).toEqual([]);
    expect(combatIntent(world, snapshotUnit(world, shooter))?.label).toBe('Approach blocked');
  });
});

describe('command intent optical privacy', () => {
  it('revokes cached intent when optical sight disappears without needing another simulation tick', () => {
    const { world, shooter, target } = field();
    const snapshot = snapshotUnit(world, shooter);
    expect(selectedAttackIntent(world, shooter)?.needsMove).toBe(true);
    world.vision!.visible.delete(target.id);
    world.vision!.detected.add(target.id);
    expect(selectedAttackIntent(world, shooter)).toBeNull();
    expect(buildFriendlyRouteMarkers(world, new Set([shooter.id]))).toEqual([]);
    const intent = combatIntent(world, snapshot);
    expect(intent?.label).not.toMatch(/Closing|blocked/);
    expect(intent?.detail).toContain('not in optical sight');
  });

  it.each(['destroyed', 'withdrawn', 'pilot dead', 'pilot ejected'] as const)('revokes a cached route immediately when the selected mech is %s', (state) => {
    const { world, shooter } = field();
    const snapshot = snapshotUnit(world, shooter);
    expect(selectedAttackIntent(world, shooter)?.needsMove).toBe(true);
    if (state === 'destroyed') shooter.destroyed = true;
    else if (state === 'withdrawn') shooter.withdrawn = true;
    else if (state === 'pilot dead') shooter.pilot.dead = true;
    else shooter.pilot.ejected = true;
    expect(selectedAttackIntent(world, shooter)).toBeNull();
    expect(combatIntent(world, snapshot)).toBeNull();
    expect(buildFriendlyRouteMarkers(world, new Set([shooter.id]))).toEqual([]);
  });

  it('never reads an unseen target position or weapon loadout, even if it remains a sensor contact', () => {
    const { world, shooter, target } = field();
    world.vision!.visible.delete(target.id);
    world.vision!.detected.add(target.id);
    const snapshot = snapshotUnit(world, shooter);
    for (const property of ['pos', 'weapons']) {
      Object.defineProperty(target, property, { get(): never { throw new Error(`hidden ${property} read`); } });
    }
    expect(selectedAttackIntent(world, shooter)).toBeNull();
    expect(buildFriendlyRouteMarkers(world, new Set([shooter.id]))).toEqual([]);
    expect(combatIntent(world, snapshot)?.label).toBe('Watching for contacts');
  });

  it('rejects hostile selection, removed units and an absent player team without reading orders', () => {
    const { world, shooter, target } = field();
    const enemySnapshot = snapshotUnit(world, target);
    const friendlySnapshot = snapshotUnit(world, shooter);
    Object.defineProperty(target, 'orders', { get(): never { throw new Error('hostile orders read'); } });
    expect(selectedAttackIntent(world, target)).toBeNull();
    expect(combatIntent(world, enemySnapshot)).toBeNull();
    expect(buildFriendlyRouteMarkers(world, new Set([target.id]))).toEqual([]);
    world.entities = [];
    expect(combatIntent(world, friendlySnapshot)).toBeNull();
    world.entities = [shooter];
    world.playerTeam = null;
    Object.defineProperty(shooter, 'orders', { get(): never { throw new Error('orders read without player'); } });
    expect(selectedAttackIntent(world, shooter)).toBeNull();
    expect(buildFriendlyRouteMarkers(world, new Set([shooter.id]))).toEqual([]);
    expect(combatIntent(world, friendlySnapshot)).toBeNull();
  });
});
