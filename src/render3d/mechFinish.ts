import type { Material } from 'three';
import type { Tone } from '../render/blueprint';
import type { MechLocation } from '../schema/common';
import type { Faction } from '../schema/faction';
import type { DamageWearTier } from './damageLedger';
import type { MachineCultureProfile } from './machineCulture';
import {
  createDamageWearMaterials,
  createSealedWearMaterials,
  type MechMaterials,
} from './mechMaterials';
import type { MountArt } from './weaponModels';

type PresentedMount = MountArt & { destroyed?: boolean };

export interface MechFinishPlan {
  /** Locations whose parts render as burnt-out, sealed shell included. */
  readonly sealedFailures: ReadonlySet<MechLocation>;
  /** Locations whose parts are left out or stumped, which a sealed hull never does. */
  readonly shownLost: ReadonlySet<MechLocation>;
  /** Only a welded hull lets a breached plate swing loose. */
  readonly loosensPanels: boolean;
  /** Head and arm channels whose lamps flicker on a worn sealed hull. */
  readonly wornChannels: ReadonlySet<MechLocation>;
  readonly ownedMaterials: Material[];
  finishFor(location: MechLocation | null, tone: Tone): Material;
}

/**
 * A welded hull shows every tier of field wear as scorch and loose plate. A
 * sealed hull keeps its shell smooth and complete, but from the second tier the
 * finish dulls and darkens so a hammered machine still reads as one.
 */
export function planMechFinish(
  tones: MechMaterials,
  burnt: MechMaterials,
  wear: Readonly<Partial<Record<MechLocation, DamageWearTier>>>,
  lost: ReadonlySet<MechLocation>,
  mounts: readonly PresentedMount[],
  faction: Faction,
  culture: Readonly<MachineCultureProfile>,
): MechFinishPlan {
  const reveals = culture.revealsFieldDamage;
  const sealedFailures = new Set<MechLocation>();
  const wornChannels = new Set<MechLocation>();
  const shownWear: Partial<Record<MechLocation, DamageWearTier>> = {};
  if (faction === 'aurelian') {
    for (const location of lost) sealedFailures.add(location);
    for (const mount of mounts) if (mount.destroyed === true) sealedFailures.add(mount.location);
  }
  for (const [location, tier] of Object.entries(wear) as [MechLocation, DamageWearTier][]) {
    if (tier === undefined) continue;
    if (reveals) shownWear[location] = tier;
    else if (tier === 2) {
      shownWear[location] = tier;
      wornChannels.add(location);
    }
  }
  const tiers = Object.values(shownWear);
  const worn = reveals && tiers.some((tier) => tier === 1) ? createDamageWearMaterials(tones, 1) : null;
  const scorched = tiers.some((tier) => tier === 2)
    ? reveals ? createDamageWearMaterials(tones, 2) : createSealedWearMaterials(tones)
    : null;
  const ownedMaterials: Material[] = [
    ...Object.values(tones),
    ...Object.values(burnt),
    ...(worn === null ? [] : Object.values(worn)),
    ...(scorched === null ? [] : Object.values(scorched)),
  ];
  return {
    sealedFailures,
    shownLost: reveals ? lost : new Set<MechLocation>(),
    loosensPanels: reveals,
    wornChannels,
    ownedMaterials,
    finishFor(location, tone) {
      const tier = location === null ? 0 : (shownWear[location] ?? 0);
      if (location !== null && (sealedFailures.has(location) || (reveals && lost.has(location)))) {
        return burnt[tone];
      }
      if (tier === 2 && scorched !== null) return scorched[tone];
      if (tier === 1 && worn !== null) return worn[tone];
      return tones[tone];
    },
  };
}
