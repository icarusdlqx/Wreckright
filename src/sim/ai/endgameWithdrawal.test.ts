import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../../tests/support';
import { updateTeamVisions } from '../sensors';
import type { MechEntity, World } from '../types';
import { shouldWithdraw } from './positioning';

/**
 * The late-battle concession. A hurt machine on the weaker side keeps fighting
 * while the clock says the battle can still turn, and quits the field once it
 * cannot — the alternative is two cripples shuffling out a timeout draw.
 */

function clockTo(world: World, fraction: number): void {
  world.tick = Math.round(
    (world.mission.maxDurationSeconds * fraction) / world.dt,
  );
}

function hurt(mech: MechEntity, fraction: number): void {
  for (const location of Object.values(mech.locations)) {
    location.internal = Math.max(1, Math.round(location.internalMax * fraction));
    location.armour = 0;
    location.rearArmour = 0;
  }
}

function cripple(world: World, team: number, fraction: number): MechEntity {
  const mech = world.entities.find((entity) => entity.team === team);
  if (mech === undefined) throw new Error(`no mech on team ${team}`);
  for (const other of world.entities) {
    if (other.team === team && other !== mech) other.destroyed = true;
  }
  hurt(mech, fraction);
  // Strength is judged through sensors, so stand the survivor where the other
  // side can be seen and refresh every side's picture before asking.
  const foe = world.entities.find(
    (entity) => entity.team !== team && !entity.destroyed,
  );
  if (foe !== undefined) mech.pos = { x: foe.pos.x + 60, y: foe.pos.y };
  updateTeamVisions(world);
  return mech;
}

describe('endgame withdrawal', () => {
  it('keeps a hurt but not broken machine fighting while the battle is young', () => {
    const world = playerWorld('endgame:early');
    const lone = cripple(world, 1, 0.4);
    clockTo(world, 0.2);

    // 0.4 structure sits above the ordinary 0.32 bar, so early on it stays.
    expect(shouldWithdraw(world, lone, false, 0.4)).toBe(false);
  });

  it('concedes the same fight once the clock is mostly burned', () => {
    const world = playerWorld('endgame:late');
    const lone = cripple(world, 1, 0.4);
    clockTo(world, 0.7);

    // Same machine, same damage, same odds — only the clock has moved.
    expect(shouldWithdraw(world, lone, false, 0.4)).toBe(true);
  });

  it('never concedes from strength: a winning side stays whatever the clock says', () => {
    const world = playerWorld('endgame:winning');
    // Team 1 keeps its full lance; team 0 is down to one hurt machine.
    const lone = cripple(world, 0, 0.9);
    const strong = world.entities.find(
      (entity) => entity.team === 1 && !entity.destroyed,
    );
    if (strong === undefined) throw new Error('no opposing mech');
    hurt(strong, 0.4);
    clockTo(world, 0.9);

    expect(shouldWithdraw(world, strong, false, 0.4)).toBe(false);
    void lone;
  });

  it('leaves a healthy machine alone even in the final stretch', () => {
    const world = playerWorld('endgame:healthy');
    const lone = cripple(world, 1, 0.95);
    clockTo(world, 0.9);

    // Above even the endgame structure bar, the fight goes on.
    expect(shouldWithdraw(world, lone, false, 0.95)).toBe(false);
  });
});
