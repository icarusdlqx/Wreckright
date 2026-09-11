import type { UnitSnapshot } from './store';

/** Promote immediate reasons a selected machine cannot execute an order. */
export function selectionReadiness(unit: Pick<UnitSnapshot, 'alive' | 'destroyed' | 'shutdownRemaining' | 'downRemaining' | 'staggered' | 'holdingFire' | 'motion'>): { label: string; tone: 'danger' | 'warn' | 'normal' } {
  if (unit.destroyed) return { label: 'Machine lost', tone: 'danger' };
  if (!unit.alive) return { label: 'Out of action', tone: 'warn' };
  if (unit.shutdownRemaining > 0) return { label: `Reactor shutdown · ${Math.ceil(unit.shutdownRemaining)}s`, tone: 'danger' };
  if (unit.downRemaining > 0) return { label: `Recovering footing · ${Math.ceil(unit.downRemaining)}s`, tone: 'warn' };
  if (unit.staggered) return { label: 'Staggered', tone: 'warn' };
  if (unit.holdingFire) return { label: 'Weapons held', tone: 'warn' };
  return { label: unit.motion === 'idle' || unit.motion === 'stationary' ? 'Standing by' : unit.motion.replaceAll('_', ' '), tone: 'normal' };
}
