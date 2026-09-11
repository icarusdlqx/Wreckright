import type { UnitSnapshot } from './store';

export function unitIntegrity(unit: Pick<UnitSnapshot, 'locations' | 'destroyed'>): number {
  if (unit.destroyed) return 0;
  const parts = Object.values(unit.locations);
  const total = parts.reduce((sum, part) => sum + (part.destroyed ? 0 : part.armour + part.rearArmour + part.internal), 0);
  const maximum = parts.reduce((sum, part) => sum + part.armourMax + part.rearArmourMax + part.internalMax, 0);
  return maximum === 0 ? 0 : Math.max(0, Math.min(1, total / maximum));
}

/** Machine damage cannot tell the commander whether its pilot survived. */
export function lanceStatus(unit: UnitSnapshot): string {
  if (unit.pilotState.dead) return 'Pilot KIA';
  if (unit.pilotState.ejected) return 'Pilot ejected';
  if (unit.withdrawn) return 'Withdrawn';
  if (unit.destroyed) return 'Mech destroyed';
  if (!unit.alive) return 'Out of action';
  if (unit.shutdownRemaining > 0) return 'Shutdown';
  if (unit.downRemaining > 0) return 'Recovering';
  if (unit.staggered) return 'Staggered';
  if (unit.holdingFire) return 'Holding fire';
  if (unit.pilotState.wounds > 0) return 'Pilot wounded';
  return unit.motion === 'stationary' || unit.motion === 'idle' ? 'Standing by' : unit.motion.replaceAll('_', ' ');
}
