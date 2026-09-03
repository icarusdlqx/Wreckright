import { describe, expect, it } from 'vitest';
import { testWorld } from '../../tests/support';
import { updateConcessions } from './concession';
import { destroyLocation } from './damage';
import { eventsOfType } from './events';
import { isOperational, type MechEntity, type World } from './types';
import { stepWorld, toResult } from './world';

function legOff(world: World, mech: MechEntity): void {
  destroyLocation(world, mech, 'left_leg');
  destroyLocation(world, mech, 'right_leg');
  world.events.length = 0;
}

function team(world: World, id: number): MechEntity[] {
  return world.entities.filter((entity) => entity.team === id);
}

function limitOf(world: World): number {
  return Math.ceil(world.rules.combat.leggedConcession.seconds / world.dt);
}

describe('legged concession', () => {
  it('concedes a legged mech left uncovered for the rule\'s seconds, and not a tick sooner', () => {
    const world = testWorld('concede');
    const [mech, ...rest] = team(world, 0);
    if (mech === undefined) throw new Error('need a mech');
    for (const other of rest) other.destroyed = true;
    legOff(world, mech);

    const limit = limitOf(world);
    for (let tick = 0; tick < limit - 1; tick += 1) updateConcessions(world);
    expect(mech.disabled).toBe(false);
    expect(isOperational(mech)).toBe(true);

    updateConcessions(world);
    expect(mech.disabled).toBe(true);
    expect(isOperational(mech)).toBe(false);
    expect(mech.killMethod).toBe('legged');
    expect(mech.destroyed).toBe(false);
    expect(mech.locations.centre_torso.internal).toBeGreaterThan(0);
    expect(eventsOfType(world.events, 'unit_disabled').map((event) => event.entityId)).toEqual([mech.id]);
  });

  it('holds on while an upright ally is close enough to cover it', () => {
    const world = testWorld('covered');
    const [mech, ally, ...rest] = team(world, 0);
    if (mech === undefined || ally === undefined) throw new Error('need two mechs');
    for (const other of rest) other.destroyed = true;
    legOff(world, mech);
    const radius = world.rules.combat.leggedConcession.allyRadius;
    ally.pos = { x: mech.pos.x + radius, y: mech.pos.y };

    const limit = limitOf(world);
    for (let tick = 0; tick < limit * 2; tick += 1) updateConcessions(world);
    expect(mech.disabled).toBe(false);
    expect(mech.concessionTicks).toBe(0);

    // The ally walks off; the clock starts from nothing.
    ally.pos = { x: mech.pos.x + radius + 1, y: mech.pos.y };
    for (let tick = 0; tick < limit - 1; tick += 1) updateConcessions(world);
    expect(mech.disabled).toBe(false);
    updateConcessions(world);
    expect(mech.disabled).toBe(true);
  });

  it('does not count another legged mech as cover', () => {
    const world = testWorld('two-stumps');
    const [mech, ally, ...rest] = team(world, 0);
    if (mech === undefined || ally === undefined) throw new Error('need two mechs');
    for (const other of rest) other.destroyed = true;
    ally.pos = { x: mech.pos.x, y: mech.pos.y };
    legOff(world, mech);
    legOff(world, ally);

    for (let tick = 0; tick < limitOf(world); tick += 1) updateConcessions(world);
    expect(mech.disabled).toBe(true);
    expect(ally.disabled).toBe(true);
  });

  it('ends the battle and reports the concession as a legged outcome', () => {
    const run = (seed: string) => {
      const world = testWorld(seed);
      // The other side can neither shoot nor leave: the concession alone must end it.
      for (const entity of team(world, 0)) {
        entity.controller = 'orders';
        for (const mount of entity.weapons) mount.destroyed = true;
      }
      for (const entity of team(world, 1)) legOff(world, entity);

      const maxTicks = limitOf(world) * 4;
      while (!world.finished && world.tick < maxTicks) stepWorld(world, maxTicks);
      return { world, result: toResult(world, seed, maxTicks) };
    };

    const { world, result } = run('concede-battle');
    expect(world.finished).toBe(true);
    expect(world.winner).toBe(0);
    expect(world.tick).toBeLessThanOrEqual(limitOf(world) + 1);
    expect(result.decided).toBe(true);
    for (const unit of result.units.filter((entry) => entry.team === 1)) {
      expect(unit.alive, unit.name).toBe(true);
      expect(unit.legged, unit.name).toBe(true);
      expect(unit.killMethod, unit.name).toBe('legged');
      expect(unit.condition.centre_torso.internal, unit.name).toBeGreaterThan(0);
    }

    // Same seed, same ledger.
    expect(run('concede-battle').result).toEqual(result);
  });
});
