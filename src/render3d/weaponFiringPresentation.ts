import type { Weapon } from '../schema/weapon';
import { weaponFireProfile } from '../sim/weaponModes';
import { weaponEventColour } from './battleEventPresentation';

const DEFAULT_SHOT: Weapon['visual'] = {
  style: 'beam',
  colour: '#ffffff',
  width: 2,
  arc: 0,
};

export interface WeaponFiringPresentation {
  readonly visual: Weapon['visual'];
  readonly projectiles: number;
  readonly velocity: number | null;
  readonly colour: number;
  readonly damage: number;
}

/** A firing event snapshots its chosen mode; presentation must not reread the live mount. */
export function weaponFiringPresentation(
  weapon: Weapon | undefined,
  modeId: string | undefined,
): WeaponFiringPresentation {
  const profile = weapon === undefined ? null : weaponFireProfile(weapon, modeId);
  return {
    visual: weapon?.visual ?? DEFAULT_SHOT,
    projectiles: profile?.projectiles ?? 1,
    velocity: weapon?.velocity ?? null,
    colour: weaponEventColour(weapon),
    damage: profile?.damage ?? 5,
  };
}
