import { describe, expect, it } from 'vitest';
import { spawnDesign, testWorld } from '../../../tests/support';
import type { World } from '../types';
import { selectFireModesForRange } from './fireModes';

type Policy = { short: string; medium: string; long: string };

function withPolicies(world: World, fireModes: Record<string, Policy>): void {
  world.rules = {
    ...world.rules,
    ai: { ...world.rules.ai, fireModes },
  };
}

function redoubt(world: World, team = 0) {
  return spawnDesign(world, 'redoubt_emplacement', team, { x: 500, y: 500 });
}

function canisterMount(world: World, team = 0) {
  const mech = redoubt(world, team);
  const mount = mech.weapons.find((candidate) => candidate.weaponId === 'lbx_ac10');
  if (mount === undefined) throw new Error('missing Canister Cannon mount');
  return { mech, mount };
}

describe('AI fire-mode selection', () => {
  it('uses the inclusive authored short and medium boundaries', () => {
    const world = testWorld('ai-fire-mode-boundaries');
    withPolicies(world, {
      lbx_ac10: { short: 'cluster', medium: 'slug', long: 'cluster' },
    });
    const weapon = world.catalog.weapons.get('lbx_ac10');
    const { mech, mount } = canisterMount(world);
    if (weapon === undefined) throw new Error('missing Canister Cannon');

    expect(selectFireModesForRange(world, mech, weapon.range.short)).toBe(0);
    expect(mount.modeId).toBe('cluster');
    expect(selectFireModesForRange(world, mech, weapon.range.short + 0.01)).toBe(1);
    expect(mount.modeId).toBe('slug');
    expect(selectFireModesForRange(world, mech, weapon.range.medium)).toBe(0);
    expect(mount.modeId).toBe('slug');
    expect(selectFireModesForRange(world, mech, weapon.range.medium + 0.01)).toBe(1);
    expect(mount.modeId).toBe('cluster');
  });

  it('ignores destroyed, mode-less and unconfigured mounts', () => {
    const world = testWorld('ai-fire-mode-ignored');
    const configured = canisterMount(world);
    configured.mount.destroyed = true;
    withPolicies(world, {
      lbx_ac10: { short: 'cluster', medium: 'slug', long: 'slug' },
      flamer: { short: 'cluster', medium: 'slug', long: 'slug' },
    });

    expect(selectFireModesForRange(world, configured.mech, 180)).toBe(0);
    expect(configured.mount.modeId).toBe('cluster');
    expect(
      configured.mech.weapons
        .filter((mount) => mount.weaponId === 'flamer')
        .every((mount) => mount.modeId === null),
    ).toBe(true);

    configured.mount.destroyed = false;
    withPolicies(world, {});
    expect(selectFireModesForRange(world, configured.mech, 180)).toBe(0);
    expect(configured.mount.modeId).toBe('cluster');
  });

  it('changes only the mode and preserves cycle, groups and random state', () => {
    const world = testWorld('ai-fire-mode-state');
    withPolicies(world, {
      lbx_ac10: { short: 'cluster', medium: 'slug', long: 'slug' },
    });
    const { mech, mount } = canisterMount(world);
    mount.cooldown = 1.75;
    mount.cycleDuration = 3;
    const groups = {
      enabled: [...mech.groupEnabled],
      intent: [...mech.groupIntent],
      mountGroup: mount.group,
    };
    const rng = world.rng.save();

    expect(selectFireModesForRange(world, mech, 180)).toBe(1);
    expect(mount).toMatchObject({
      modeId: 'slug',
      cooldown: 1.75,
      cycleDuration: 3,
      group: groups.mountGroup,
    });
    expect(mech.groupEnabled).toEqual(groups.enabled);
    expect(mech.groupIntent).toEqual(groups.intent);
    expect(world.rng.save()).toEqual(rng);
  });

  it('applies the same range policy to either side', () => {
    const world = testWorld('ai-fire-mode-symmetry');
    withPolicies(world, {
      lbx_ac10: { short: 'cluster', medium: 'slug', long: 'slug' },
    });
    const left = canisterMount(world, 0);
    const right = canisterMount(world, 1);

    expect(selectFireModesForRange(world, left.mech, 180)).toBe(1);
    expect(selectFireModesForRange(world, right.mech, 180)).toBe(1);
    expect(left.mount.modeId).toBe('slug');
    expect(right.mount.modeId).toBe('slug');
  });
});
