import type { Weapon } from '../../schema/weapon';
import type { MechEntity, World } from '../types';
import { setWeaponMode } from '../weaponModes';

type FireModeBand = 'short' | 'medium' | 'long';

function bandFor(weapon: Weapon, range: number): FireModeBand {
  if (range <= weapon.range.short) return 'short';
  if (range <= weapon.range.medium) return 'medium';
  return 'long';
}

/** Applies authored policy to mounts without learning anything about the target. */
export function selectFireModesForRange(world: World, mech: MechEntity, range: number): number {
  let changed = 0;

  for (const mount of mech.weapons) {
    const weapon = world.catalog.weapons.get(mount.weaponId);
    if (weapon === undefined || weapon.modes.length === 0) continue;
    const policy = world.rules.ai.fireModes[weapon.id];
    if (policy === undefined) continue;
    const modeId = policy[bandFor(weapon, range)];
    if (mount.modeId === modeId) continue;
    if (setWeaponMode(weapon, mount, modeId)) changed += 1;
  }

  return changed;
}
