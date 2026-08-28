import type { Weapon, WeaponMode } from '../schema/weapon';
import type { WeaponMount } from './types';

export interface WeaponFireProfile {
  readonly modeId: string | null;
  readonly name: string | null;
  readonly damage: number;
  readonly projectiles: number;
  readonly accuracy: number;
  readonly heat: number;
  readonly cooldown: number;
}

/** An exact authored lookup. Default selection belongs at the runtime boundary. */
export function weaponMode(
  weapon: Weapon,
  modeId: string | null | undefined,
): WeaponMode | null {
  if (modeId === null || modeId === undefined) return null;
  return weapon.modes.find((mode) => mode.id === modeId) ?? null;
}

/** Old designs take the first mode; old weapons remain mode-less. */
export function resolveWeaponModeId(
  weapon: Weapon,
  requested: string | null | undefined,
): string | null {
  return weaponMode(weapon, requested)?.id ?? weapon.modes[0]?.id ?? null;
}

export function weaponFireProfile(
  weapon: Weapon,
  modeId: string | null | undefined,
): WeaponFireProfile {
  const resolvedId = resolveWeaponModeId(weapon, modeId);
  const mode = weaponMode(weapon, resolvedId);
  return {
    modeId: resolvedId,
    name: mode?.name ?? null,
    damage: mode?.damage ?? weapon.damage,
    projectiles: mode?.projectiles ?? weapon.projectiles,
    accuracy: mode?.accuracy ?? weapon.accuracy,
    heat: mode?.heat ?? weapon.heat,
    cooldown: mode?.cooldown ?? weapon.cooldown,
  };
}

/** Switching is an order, not a tick: it consumes no clock or random draw. */
export function setWeaponMode(
  weapon: Weapon,
  mount: WeaponMount,
  modeId: string,
): boolean {
  if (mount.destroyed || mount.weaponId !== weapon.id || weaponMode(weapon, modeId) === null) {
    return false;
  }
  mount.modeId = modeId;
  return true;
}
