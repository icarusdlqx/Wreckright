import type { Faction } from '../schema/faction';
import type { SimEvent } from '../sim/events';
import { findEntity, isOperational, type MechEntity, type World } from '../sim/types';
import { FIELD_RADIO, type OrderCall } from '../schema/fieldRadio';
import type { PilotCall } from '../schema/pilotPersonality';
import { pilotPersonality } from './pilotPersonality';

export interface RadioMessage {
  id: number;
  pilot: { id: string; name: string; templateId?: string } | null;
  speaker: string;
  text: string;
  priority: 'routine' | 'urgent' | 'story';
}

let activeWorld: World | null = null;
let message: RadioMessage | null = null;
let serial = 0;
let lastRoutineTick = -Infinity;
let lastUrgentTick = -Infinity;
const lineIndices = new Map<string, number>();
const incomingHits = new Map<number, { tick: number; damage: number }[]>();
const lastPressureTick = new Map<number, number>();
const heard = new Set<string>();
const listeners = new Set<() => void>();

export const readRadioMessage = (): RadioMessage | null => message;
export function subscribeRadio(listener: () => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
function emit(): void { for (const listener of listeners) listener(); }
export function dismissRadio(id: number): void {
  if (message?.id !== id) return;
  message = null; emit();
}
export function beginFieldRadio(world: World): void {
  activeWorld = world; message = null; lastRoutineTick = -Infinity;
  lastUrgentTick = -Infinity; lineIndices.clear(); incomingHits.clear(); lastPressureTick.clear(); heard.clear(); emit();
}
export function endFieldRadio(world: World): void {
  if (activeWorld !== world) return;
  activeWorld = null; message = null; incomingHits.clear(); lastPressureTick.clear(); heard.clear(); emit();
}
function say(world: World, pilot: RadioMessage['pilot'], text: string, priority: RadioMessage['priority']): boolean {
  if (world !== activeWorld) return false;
  if (priority === 'routine' && (world.tick - lastRoutineTick) * world.dt < FIELD_RADIO.routineGapSeconds) return false;
  if (priority === 'routine' && message !== null) return false;
  if (priority === 'story' && message?.priority === 'urgent') return false;
  if (priority === 'urgent' && (world.tick - lastUrgentTick) * world.dt < FIELD_RADIO.urgentGapSeconds) return false;
  if (priority === 'routine') lastRoutineTick = world.tick;
  if (priority === 'urgent') lastUrgentTick = world.tick;
  message = {
    id: ++serial,
    pilot,
    speaker: pilot?.name ?? 'Command channel', text, priority,
  };
  emit(); return true;
}

/** A single selected pilot answers for the group; repeated clicks never stack a chorus. */
export function pilotOrder(world: World, pilot: MechEntity | null, order: OrderCall): Faction | undefined {
  if (pilot === null || pilot.team !== world.playerTeam || !isOperational(pilot)) return;
  const faction = world.catalog.chassis.get(pilot.chassisId)?.faction ?? 'linewrought';
  if (!pilotCall(world, pilot, order, FIELD_RADIO.lines[faction][order])) return;
  if (order === 'attack') heard.add(`engaged:${pilot.id}`);
  return faction;
}

function pilotCall(world: World, entity: MechEntity, call: PilotCall, fallback: readonly string[]): boolean {
  const lines = pilotPersonality(world.catalog, entity.pilot)?.lines[call] ?? fallback;
  const key = `${entity.pilot.id}:${call}`;
  const index = lineIndices.get(key) ?? 0;
  if (!say(world, entity.pilot, lines[index % lines.length]!, 'routine')) return false;
  lineIndices.set(key, index + 1);
  return true;
}

function observeCombat(world: World, events: readonly SimEvent[]): void {
  const rules = FIELD_RADIO.pressure;
  for (const event of events) {
    if (event.type !== 'projectile_hit' || event.damage <= 0) continue;
    const target = findEntity(world, event.targetId);
    if (target?.team !== world.playerTeam || !isOperational(target)) continue;
    const hits = (incomingHits.get(target.id) ?? []).filter((hit) => (world.tick - hit.tick) * world.dt <= rules.windowSeconds);
    hits.push({ tick: event.tick, damage: event.damage });
    incomingHits.set(target.id, hits);
    if (hits.length < rules.minimumHits || hits.reduce((sum, hit) => sum + hit.damage, 0) < rules.minimumDamage) continue;
    if ((world.tick - (lastPressureTick.get(target.id) ?? -Infinity)) * world.dt < rules.cooldownSeconds) continue;
    // Pressure is colour, so it never interrupts a mission report or an emergency.
    if (pilotCall(world, target, 'heavy_fire', [FIELD_RADIO.alerts.heavy_fire])) lastPressureTick.set(target.id, world.tick);
  }
  for (const event of events) {
    if (event.type !== 'weapon_fired') continue;
    const key = `engaged:${event.shooterId}`;
    if (heard.has(key)) continue;
    const shooter = findEntity(world, event.shooterId);
    if (pilotOrder(world, shooter, 'attack') !== undefined) heard.add(key);
  }
}

/** Reports use only friendly state and public mission messages, never hidden enemy casualties. */
export function observeFieldRadio(world: World, events: readonly SimEvent[]): void {
  if (world !== activeWorld) return;
  const friendly = (id: number): MechEntity | null => {
    const entity = findEntity(world, id);
    return entity?.team === world.playerTeam ? entity : null;
  };
  for (const event of events) {
    if (event.type === 'mission_message') {
      const speaker = event.speakerPilotId === undefined ? null : world.catalog.pilots.get(event.speakerPilotId) ?? null;
      say(world, speaker, event.text, 'story'); continue;
    }
    if (event.type === 'zone_captured' && event.team === world.playerTeam) {
      const key = `secured:${event.zoneId}`;
      if (heard.has(key)) continue;
      heard.add(key);
      const zone = world.zones.find((candidate) => candidate.id === event.zoneId);
      say(world, null, `${zone?.name ?? 'Objective site'} secured. Check the remaining orders.`, 'story');
      continue;
    }
    if (!('entityId' in event)) continue;
    const entity = friendly(event.entityId);
    if (entity === null) continue;
    const key = `${event.type}:${event.entityId}`;
    if (heard.has(key)) continue;
    let text: string | null = null;
    if (event.type === 'shutdown') text = FIELD_RADIO.alerts.shutdown;
    if (event.type === 'pilot_ejected') text = FIELD_RADIO.alerts.pilot_ejected;
    if (event.type === 'pilot_injured') text = FIELD_RADIO.alerts.pilot_injured;
    if (event.type === 'location_destroyed' && event.location.endsWith('_arm')) text = FIELD_RADIO.alerts.arm_lost;
    if (text !== null && say(world, entity.pilot, text, 'urgent')) heard.add(key);
  }
  observeCombat(world, events);
}
