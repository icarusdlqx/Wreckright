import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { playerWorld, testWorld } from '../../tests/support';
import { updateSupport, type RepairTruck } from '../sim/support';
import { SupportStatus } from './SupportStatus';
import { supportStatus, supportStatusProgress, supportStatusTitle } from './supportStatusModel';

function queuedWorld() {
  const world = playerWorld('support-status');
  world.support.pending.push({ call: 'air_strike', team: 0, target: { x: 120, y: 120 }, heading: 0,
    resolveTick: world.tick + 61 });
  return world;
}

describe('friendly support status', () => {
  it('keeps queued timing tied to simulation ticks, including a paused call', () => {
    const world = queuedWorld();
    const entry = supportStatus(world)[0]!;
    expect(entry.kind).toBe('queued');
    expect(entry.remainingSeconds).toBe(4);
    expect(supportStatusTitle(entry)).toBe('Air Strike · 4s to arrival');
    expect(supportStatusProgress(entry, true)).toBe('Paused — resume to dispatch');
    expect(supportStatus(world)[0]?.remainingSeconds).toBe(4);
    world.tick += 21;
    expect(supportStatus(world)[0]?.remainingSeconds).toBe(2);
    expect(supportStatusProgress(entry, false)).toBe('Inbound to your marked target');
  });

  it('shows the closest friendly arrival first and never reveals opposing support', () => {
    const world = queuedWorld();
    world.support.pending.push(
      { call: 'repair_truck', team: 0, target: { x: 120, y: 120 }, heading: 0, resolveTick: 20 },
      { call: 'reinforcement', team: 1, target: { x: 120, y: 120 }, heading: 0, resolveTick: 1 },
    );
    world.support.trucks.push({ team: 1, pos: { x: 120, y: 120 }, radius: 100, armourPerSecond: 10, expiresTick: 100 });
    expect(supportStatus(world).map((entry) => entry.label)).toEqual(['Repair Truck', 'Air Strike']);
    expect(supportStatus(world)[0]?.detail).toContain(`${world.rules.support.repair_truck.cost} RP spent`);
  });

  it('shows no status without a player, after the mission or without live calls', () => {
    expect(supportStatus(null)).toEqual([]);
    expect(supportStatus(testWorld())).toEqual([]);
    expect(supportStatus(playerWorld())).toEqual([]);
    const world = queuedWorld();
    world.finished = true;
    expect(supportStatus(world)).toEqual([]);
    expect(renderToStaticMarkup(createElement(SupportStatus, { world: null, paused: true }))).toBe('');
  });

  it('counts only operational friendlies and repairable armour in the active circle', () => {
    const world = playerWorld();
    const friends = world.entities.filter((entity) => entity.team === 0);
    const damaged = friends[0]!;
    const broken = friends[1]!;
    world.entities.forEach((entity) => { entity.pos = { x: 500, y: 500 }; });
    damaged.pos = { x: 100, y: 100 };
    damaged.locations.centre_torso.rearArmour -= 2;
    broken.pos = { x: 100, y: 100 };
    broken.locations.left_arm.destroyed = true;
    broken.locations.left_arm.armour = 0;
    const enemy = world.entities.find((entity) => entity.team === 1)!;
    enemy.pos = { x: 100, y: 100 };
    enemy.locations.centre_torso.armour = 0;
    world.support.trucks.push({ team: 0, pos: { x: 100, y: 100 }, radius: 40,
      armourPerSecond: 2, expiresTick: 120, repairedArmour: 7.8 });
    const entry = supportStatus(world)[0]!;
    expect(entry).toMatchObject({ kind: 'repair', remainingSeconds: 6, inRange: 2, damagedInRange: 1, repairedArmour: 7 });
    expect(entry.detail).toContain('1 damaged mech in the circle');
    expect(entry.detail).toContain('internals, destroyed parts, weapons and ammunition stay unchanged');
    expect(supportStatusProgress(entry, true)).toBe('7 armour restored · 2 in range · Paused');
  });

  it('reports actually applied armour and stops showing an expired truck', () => {
    const world = playerWorld();
    const friendly = world.entities.find((entity) => entity.team === 0)!;
    world.entities.forEach((entity) => { entity.pos = { x: 500, y: 500 }; });
    friendly.pos = { x: 100, y: 100 };
    friendly.locations.centre_torso.armour -= 1;
    const truck: RepairTruck = { team: 0, pos: { x: 100, y: 100 }, radius: 40,
      armourPerSecond: 100, expiresTick: 120, repairedArmour: 0 };
    world.support.trucks.push(truck);
    updateSupport(world);
    const entry = supportStatus(world)[0]!;
    expect(entry.repairedArmour).toBe(1);
    expect(entry.damagedInRange).toBe(0);
    expect(entry.detail).toContain('Move damaged mechs into the repair circle');
    world.tick = truck.expiresTick;
    expect(supportStatus(world)).toEqual([]);
  });

  it('leaves the support state unchanged while reading it and tolerates older truck records', () => {
    const world = queuedWorld();
    world.support.trucks.push({ team: 0, pos: { x: 100, y: 100 }, radius: 40, armourPerSecond: 2, expiresTick: 120 });
    const before = structuredClone(world.support);
    const entries = supportStatus(world);
    expect(entries.find((entry) => entry.kind === 'repair')?.repairedArmour).toBe(0);
    expect(world.support).toEqual(before);
  });

  it('keeps the paused dispatch explanation in the collapsed summary and exposes expandable details', () => {
    const html = renderToStaticMarkup(createElement(SupportStatus, { world: queuedWorld(), paused: true }));
    const summary = html.match(/<summary>(.*?)<\/summary>/u)?.[1] ?? '';
    expect(summary).toContain('Air Strike · 4s to arrival');
    expect(summary).toContain('Paused — resume to dispatch');
    expect(html).toContain('data-testid="support-status-queued"');
    expect(html).toContain('RP spent. The aircraft will cross the chosen lane.');
    expect(html).not.toContain('<details open');
  });
});
