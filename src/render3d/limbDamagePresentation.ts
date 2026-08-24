import { Mesh } from 'three';
import type { MechLocation } from '../schema/common';
import type { Faction } from '../schema/faction';
import type { DamageWearTier } from './damageLedger';

type LimbLocation = 'left_arm' | 'right_arm' | 'left_leg' | 'right_leg';

interface DamageableLegRig {
  hip: import('three').Group;
  hipRestX: number;
  hipRestY: number;
  hipRestZ: number;
  location: 'left_leg' | 'right_leg';
  damageTier: DamageWearTier;
  destroyed: boolean;
}

export function isLimbLocation(location: MechLocation): location is LimbLocation {
  return location === 'left_arm' || location === 'right_arm'
    || location === 'left_leg' || location === 'right_leg';
}

/** Sealed armour dents as one shell; welded armour hangs apart at the seams. */
export function markDamagedLimbMesh(
  mesh: Mesh,
  location: MechLocation | null,
  tier: DamageWearTier,
  faction: Faction,
  scale: number,
  destroyed: boolean,
): void {
  if (location === null || !isLimbLocation(location) || tier === 0) return;
  mesh.userData.limbDamageTier = tier;
  mesh.userData.limbDisabled = destroyed;
  if (location === 'left_leg' || location === 'right_leg') return;

  const side = location === 'left_arm' ? 1 : -1;
  const severity = tier === 1 ? 0.45 : 1;
  const culture = faction === 'aurelian' ? 0.72 : 1;
  mesh.rotation.x += side * severity * culture * 0.16;
  mesh.rotation.z -= severity * culture * 0.09;
  mesh.position.y -= scale * severity * culture * 0.028;
  if (destroyed && faction === 'aurelian') mesh.scale.multiplyScalar(0.94);
}

/** A damaged running assembly sits visibly short even before it is fully lost. */
export function settleDamagedLegRig(
  rig: DamageableLegRig,
  tier: DamageWearTier,
  scale: number,
  destroyed: boolean,
): void {
  rig.damageTier = tier;
  rig.destroyed = destroyed;
  if (tier === 0) return;

  const side = rig.location === 'left_leg' ? 1 : -1;
  const severity = tier === 1 ? 0.42 : 1;
  rig.hipRestX -= scale * severity * 0.012;
  rig.hipRestY -= scale * severity * 0.034;
  rig.hipRestZ -= side * scale * severity * 0.009;
  rig.hip.position.set(rig.hipRestX, rig.hipRestY, rig.hipRestZ);
  rig.hip.userData.damageLocation = rig.location;
  rig.hip.userData.limbDamageTier = tier;
  rig.hip.userData.limbDisabled = destroyed;
}
