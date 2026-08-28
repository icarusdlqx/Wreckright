import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import type { Design } from '../schema/design';
import { createMech } from './entity';
import {
  resolveWeaponModeId,
  setWeaponMode,
  weaponFireProfile,
  weaponMode,
} from './weaponModes';

function canister() {
  const weapon = catalog.weapons.get('lbx_ac10');
  if (weapon === undefined) throw new Error('missing Canister Cannon');
  return weapon;
}

function redoubt(design?: Design) {
  return createMech(catalog, catalog.rules, {
    id: 90,
    team: 0,
    designId: 'redoubt_emplacement',
    design,
    pilotId: 'nadia_ostrow',
    spawn: { x: 100, y: 100 },
    facingDegrees: 0,
  });
}

describe('weapon modes', () => {
  it('resolves the authored default and partial overrides over the base profile', () => {
    const weapon = canister();
    expect(resolveWeaponModeId(weapon, undefined)).toBe('cluster');
    expect(resolveWeaponModeId(weapon, 'missing')).toBe('cluster');
    expect(weaponMode(weapon, 'missing')).toBeNull();
    expect(weaponFireProfile(weapon, 'cluster')).toEqual({
      modeId: 'cluster',
      name: 'Cluster',
      damage: 1.2,
      projectiles: 10,
      accuracy: 1.1,
      heat: 2,
      cooldown: 3,
    });
    expect(weaponFireProfile(weapon, 'slug')).toEqual({
      modeId: 'slug',
      name: 'Slug',
      damage: 13.2,
      projectiles: 1,
      accuracy: 1,
      heat: 2,
      cooldown: 3,
    });
  });

  it('initializes a valid requested mode, or the default, without changing old designs', () => {
    const authored = catalog.designs.get('redoubt_emplacement');
    if (authored === undefined) throw new Error('missing Redoubt design');
    const design = structuredClone(authored);
    const requested = design.mounts.find((mount) => mount.weaponId === 'lbx_ac10');
    if (requested === undefined) throw new Error('missing Canister Cannon mount');
    requested.modeId = 'slug';

    const defaultMount = redoubt().weapons.find((mount) => mount.weaponId === 'lbx_ac10');
    const slugMount = redoubt(design).weapons.find((mount) => mount.weaponId === 'lbx_ac10');
    expect(defaultMount).toMatchObject({ modeId: 'cluster', cycleDuration: 3 });
    expect(slugMount).toMatchObject({ modeId: 'slug', cycleDuration: 3 });
    expect(redoubt().weapons.find((mount) => mount.weaponId === 'flamer')).toMatchObject({
      modeId: null,
    });
  });

  it('switches deterministically while preserving an in-flight cycle', () => {
    const weapon = canister();
    const first = redoubt().weapons.find((mount) => mount.weaponId === weapon.id);
    const second = redoubt().weapons.find((mount) => mount.weaponId === weapon.id);
    if (first === undefined || second === undefined) throw new Error('missing mode mounts');
    for (const mount of [first, second]) {
      mount.cooldown = 1.75;
      mount.cycleDuration = 3;
      expect(setWeaponMode(weapon, mount, 'slug')).toBe(true);
      expect(setWeaponMode(weapon, mount, 'cluster')).toBe(true);
      expect(setWeaponMode(weapon, mount, 'slug')).toBe(true);
    }

    expect(first).toEqual(second);
    expect(first).toMatchObject({ modeId: 'slug', cooldown: 1.75, cycleDuration: 3 });
  });

  it('rejects destroyed, mismatched and unknown mode switches without mutation', () => {
    const weapon = canister();
    const mount = redoubt().weapons.find((entry) => entry.weaponId === weapon.id);
    const other = catalog.weapons.get('ac5');
    if (mount === undefined || other === undefined) throw new Error('missing switch fixtures');
    const initial = structuredClone(mount);

    expect(setWeaponMode(other, mount, 'slug')).toBe(false);
    expect(setWeaponMode(weapon, mount, 'unknown')).toBe(false);
    expect(mount).toEqual(initial);
    mount.destroyed = true;
    expect(setWeaponMode(weapon, mount, 'slug')).toBe(false);
    expect(mount.modeId).toBe('cluster');
  });
});
