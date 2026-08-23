import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { playerWorld, testWorld } from '../../tests/support';
import {
  canPresentIncomingCue,
  canPresentWeaponFlight,
  incomingCueOrigin,
  missCueAngle,
  missCueDistance,
} from './battleEventPresentation';

describe('battle event presentation', () => {
  it('admits a complete trajectory in an omniscient simulation view', () => {
    const world = testWorld('omniscient-flight');
    const shooter = world.entities[0];
    const target = world.entities[1];
    if (shooter === undefined || target === undefined) throw new Error('missing test combatants');
    expect(canPresentWeaponFlight(world, {
      type: 'weapon_fired',
      tick: 1,
      shooterId: shooter.id,
      targetId: target.id,
      weaponId: 'medium_laser',
    })).toBe(true);
  });

  it('clips hidden incoming fire to a target-side bearing independent of the shooter', () => {
    const world = playerWorld('private-incoming-cue');
    const vision = world.vision;
    if (vision === null) throw new Error('player world has no vision');
    const ally = world.entities.find((entity) => entity.team === vision.team);
    const enemies = world.entities.filter((entity) => entity.team !== vision.team);
    const first = enemies[0];
    const second = enemies[1];
    if (ally === undefined || first === undefined || second === undefined) {
      throw new Error('missing test combatants');
    }
    vision.visible.delete(first.id);
    vision.visible.delete(second.id);
    const base = {
      type: 'weapon_fired' as const,
      tick: 42,
      shooterId: first.id,
      targetId: ally.id,
      weaponId: 'lrm20',
    };
    expect(canPresentWeaponFlight(world, base)).toBe(false);
    expect(canPresentIncomingCue(world, base)).toBe(true);

    const target = { x: 300, y: 240 };
    const firstOrigin = incomingCueOrigin(base, target, () => 5, new Vector3());
    const secondOrigin = incomingCueOrigin(
      { ...base, shooterId: second.id },
      target,
      () => 5,
      new Vector3(),
    );
    expect(firstOrigin.toArray()).toEqual(secondOrigin.toArray());
    expect(Math.hypot(firstOrigin.x - target.x, firstOrigin.z - target.y)).toBeCloseTo(54);
  });

  it('keeps a target-side miss point independent of the hidden shooter', () => {
    const base = {
      type: 'projectile_miss' as const,
      tick: 42,
      shooterId: 17,
      targetId: 4,
      weaponId: 'lrm20',
    };
    const otherShooter = { ...base, shooterId: 91 };

    expect(missCueAngle(otherShooter)).toBe(missCueAngle(base));
    expect(missCueDistance(otherShooter)).toBe(missCueDistance(base));
  });
});
