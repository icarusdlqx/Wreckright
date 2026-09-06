import { LOCATIONS } from '../schema/common';
import { distance } from '../sim/math';
import type { SupportCallId } from '../sim/support';
import { isOperational, type World } from '../sim/types';

const LABELS: Record<SupportCallId, string> = {
  sensor_probe: 'Sensor Probe', air_strike: 'Air Strike', repair_truck: 'Repair Truck',
  reinforcement: 'Reinforcement', artillery_strike: 'Artillery Strike', minelayer: 'Minelayer',
};

export interface SupportStatusEntry {
  id: string;
  kind: 'queued' | 'repair';
  label: string;
  remainingSeconds: number;
  detail: string;
  inRange?: number;
  damagedInRange?: number;
  repairedArmour?: number;
}

/** Only the player's own calls and friendly repair candidates cross this seam. */
export function supportStatus(world: World | null): SupportStatusEntry[] {
  if (world === null || world.playerTeam === null || world.finished) return [];
  const queued: SupportStatusEntry[] = world.support.pending
    .filter((pending) => pending.team === world.playerTeam)
    .map((pending, index) => ({
      id: `queued-${pending.call}-${pending.resolveTick}-${index}`,
      kind: 'queued', label: LABELS[pending.call],
      remainingSeconds: Math.ceil(Math.max(0, (pending.resolveTick - world.tick) * world.dt)),
      detail: `${world.rules.support[pending.call].cost} RP spent. ${pending.call === 'air_strike' ? 'The aircraft will cross the chosen lane.' : 'The call will arrive at the chosen point.'}`,
    }));
  queued.sort((a, b) => a.remainingSeconds - b.remainingSeconds);
  const active: SupportStatusEntry[] = [];
  world.support.trucks.forEach((truck, index) => {
    if (truck.team !== world.playerTeam || truck.expiresTick <= world.tick) return;
    const friendlies = world.entities.filter((entity) => entity.team === world.playerTeam &&
      isOperational(entity) && distance(entity.pos, truck.pos) <= truck.radius);
    const damaged = friendlies.filter((entity) => LOCATIONS.some((location) => {
      const plate = entity.locations[location];
      return !plate.destroyed && (plate.armour < plate.armourMax || plate.rearArmour < plate.rearArmourMax);
    }));
    const repairedArmour = Math.floor(Math.max(0, truck.repairedArmour ?? 0));
    active.push({
      id: `repair-${truck.expiresTick}-${index}`, kind: 'repair', label: 'Repair Truck',
      remainingSeconds: Math.ceil((truck.expiresTick - world.tick) * world.dt),
      repairedArmour, inRange: friendlies.length, damagedInRange: damaged.length,
      detail: `${damaged.length} damaged ${damaged.length === 1 ? 'mech' : 'mechs'} in the circle. ${damaged.length === 0 ? 'Move damaged mechs into the repair circle. ' : ''}Armour only; internals, destroyed parts, weapons and ammunition stay unchanged.`,
    });
  });
  return [...queued, ...active];
}

export function supportStatusTitle(entry: SupportStatusEntry): string {
  return `${entry.label} · ${entry.remainingSeconds}s ${entry.kind === 'queued' ? 'to arrival' : 'remaining'}`;
}

export function supportStatusProgress(entry: SupportStatusEntry, paused: boolean): string {
  if (entry.kind === 'queued') return paused ? 'Paused — resume to dispatch' : 'Inbound to your marked target';
  const progress = `${entry.repairedArmour ?? 0} armour restored · ${entry.inRange ?? 0} in range`;
  return paused ? `${progress} · Paused` : progress;
}
