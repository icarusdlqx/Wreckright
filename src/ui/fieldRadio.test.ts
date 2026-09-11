import { describe, expect, it } from 'vitest';
import { playerWorld, unitOf } from '../../tests/support';
import { beginFieldRadio, dismissRadio, endFieldRadio, observeFieldRadio, pilotOrder, readRadioMessage } from './fieldRadio';
import { FIELD_RADIO } from '../schema/fieldRadio';
import type { SimEvent } from '../sim/events';

describe('field radio presentation', () => {
  it('lets one friendly pilot answer and prevents repeated commands replacing a visible report', () => {
    const world = playerWorld('radio-order');
    const pilot = unitOf(world, 'bulwark_assault');
    beginFieldRadio(world);
    expect(pilotOrder(world, pilot, 'move')).toBe('linewrought');
    const first = readRadioMessage()!;
    expect(first.pilot?.id).toBe(pilot.pilot.id);
    world.tick += 400;
    expect(pilotOrder(world, pilot, 'attack')).toBeUndefined();
    expect(readRadioMessage()).toBe(first);
    dismissRadio(first.id + 1);
    expect(readRadioMessage()).toBe(first);
    dismissRadio(first.id);
    expect(pilotOrder(world, pilot, 'attack')).toBe('linewrought');
  });

  it('prioritises friendly damage, deduplicates it, and never reports enemy damage', () => {
    const world = playerWorld('radio-alert');
    const pilot = unitOf(world, 'bulwark_assault');
    const enemy = world.entities.find((entity) => entity.team !== 0)!;
    beginFieldRadio(world);
    observeFieldRadio(world, [{ type: 'shutdown', tick: 0, entityId: enemy.id, forced: true }]);
    expect(readRadioMessage()).toBeNull();
    pilotOrder(world, pilot, 'move');
    const event = { type: 'shutdown' as const, tick: 0, entityId: pilot.id, forced: true };
    observeFieldRadio(world, [event, { type: 'mission_message', tick: 0, text: 'A new report.' }]);
    const urgent = readRadioMessage()!;
    expect(urgent.priority).toBe('urgent');
    expect(urgent.pilot?.name).toBe(pilot.pilot.name);
    dismissRadio(urgent.id);
    world.tick += 100;
    observeFieldRadio(world, [event]);
    expect(readRadioMessage()).toBeNull();
  });

  it('uses an authored speaker only while that pilot is deployed, alive and operational', () => {
    const world = playerWorld('radio-speaker');
    beginFieldRadio(world);
    const deployed = unitOf(world, 'bulwark_assault');
    observeFieldRadio(world, [{ type: 'mission_message', tick: 0, text: 'Public transmission.', speakerPilotId: deployed.pilot.id }]);
    expect(readRadioMessage()).toMatchObject({ speaker: deployed.pilot.name, pilot: { id: deployed.pilot.id }, priority: 'story' });
    expect(pilotOrder(world, unitOf(world, 'bulwark_assault'), 'move')).toBeUndefined();
  });

  it('falls back to the command channel when an authored pilot is absent or out of action', () => {
    const world = playerWorld('radio-speaker-fallback');
    const deployed = unitOf(world, 'bulwark_assault');
    beginFieldRadio(world);
    observeFieldRadio(world, [{ type: 'mission_message', tick: 0, text: 'Absent report.', speakerPilotId: 'petra_lindqvist' }]);
    expect(readRadioMessage()).toMatchObject({ speaker: 'Command channel', pilot: null });
    dismissRadio(readRadioMessage()!.id);
    deployed.pilot.dead = true;
    observeFieldRadio(world, [{ type: 'mission_message', tick: 0, text: 'Casualty report.', speakerPilotId: deployed.pilot.id }]);
    expect(readRadioMessage()).toMatchObject({ speaker: 'Command channel', pilot: null });
  });

  it('isolates old fields and leaves simulation randomness, orders and history untouched', () => {
    const old = playerWorld('old-radio');
    const world = playerWorld('new-radio');
    const twin = playerWorld('new-radio');
    const before = JSON.stringify([world.entities, world.events]);
    beginFieldRadio(world);
    pilotOrder(old, unitOf(old, 'bulwark_assault'), 'move');
    observeFieldRadio(old, [{ type: 'mission_message', tick: 0, text: 'Stale field.' }]);
    expect(readRadioMessage()).toBeNull();
    pilotOrder(world, unitOf(world, 'bulwark_assault'), 'move');
    endFieldRadio(old);
    expect(readRadioMessage()).not.toBeNull();
    expect(JSON.stringify([world.entities, world.events])).toBe(before);
    expect(world.rng.next()).toBe(twin.rng.next());
    beginFieldRadio(twin);
    expect(readRadioMessage()).toBeNull();
    endFieldRadio(twin);
    pilotOrder(twin, unitOf(twin, 'bulwark_assault'), 'move');
    expect(readRadioMessage()).toBeNull();
  });

  it('gives the calm observer and fiery risk-taker distinct voices on the same machine', () => {
    const world = playerWorld('radio-voices');
    const mech = unitOf(world, 'bulwark_assault');
    const petra = world.catalog.pilots.get('petra_lindqvist')!;
    const juno = world.catalog.pilots.get('juno_reyes')!;
    beginFieldRadio(world);
    mech.pilot = { ...mech.pilot, id: petra.id, name: petra.name };
    pilotOrder(world, mech, 'move');
    expect(readRadioMessage()?.text).toBe('Quiet feet. Better angle.');
    dismissRadio(readRadioMessage()!.id);
    world.tick += Math.ceil(FIELD_RADIO.routineGapSeconds / world.dt);
    mech.pilot = { ...mech.pilot, id: juno.id, name: juno.name };
    pilotOrder(world, mech, 'move');
    expect(readRadioMessage()?.text).toBe('Come on, darling. Show them we can move.');
    dismissRadio(readRadioMessage()!.id);
    world.tick += Math.ceil(FIELD_RADIO.routineGapSeconds / world.dt);
    mech.pilot = { ...mech.pilot, id: petra.id, name: petra.name };
    pilotOrder(world, mech, 'move');
    expect(readRadioMessage()?.text).toBe('Moving. No need to announce the visit.');
  });

  it('keeps the routine cooldown after dismissal, and starts a fresh voice rotation for a new field', () => {
    const world = playerWorld('radio-cooldown');
    const mech = unitOf(world, 'bulwark_assault');
    beginFieldRadio(world);
    pilotOrder(world, mech, 'move');
    const first = readRadioMessage()!;
    dismissRadio(first.id);
    world.tick += Math.ceil(FIELD_RADIO.routineGapSeconds / world.dt) - 1;
    expect(pilotOrder(world, mech, 'move')).toBeUndefined();
    beginFieldRadio(world);
    pilotOrder(world, mech, 'move');
    expect(readRadioMessage()?.text).toBe(first.text);
  });

  it('answers actual friendly engagement once per pilot without describing hostile firing', () => {
    const world = playerWorld('radio-engagement');
    const mech = unitOf(world, 'bulwark_assault');
    mech.pilot = { ...mech.pilot, id: 'teodor_krysa', name: 'Teodor Krysa' };
    const enemy = world.entities.find((entity) => entity.team !== world.playerTeam)!;
    const shot = (shooterId: number): SimEvent => ({
      type: 'weapon_fired', tick: world.tick, shooterId, targetId: enemy.id, weaponId: 'test_weapon',
    });
    beginFieldRadio(world);
    observeFieldRadio(world, [shot(enemy.id)]);
    expect(readRadioMessage()).toBeNull();
    observeFieldRadio(world, [shot(mech.id)]);
    expect(readRadioMessage()?.text).toBe('Taking it down.');
    dismissRadio(readRadioMessage()!.id);
    world.tick += 1000;
    observeFieldRadio(world, [shot(mech.id)]);
    expect(readRadioMessage()).toBeNull();
  });

  it('reacts to sustained friendly pressure, ignores isolated hits, and limits repeated remarks', () => {
    const world = playerWorld('radio-pressure');
    const mech = unitOf(world, 'bulwark_assault');
    mech.pilot = { ...mech.pilot, id: 'bo_ferrant', name: 'Bo Ferrant' };
    const enemy = world.entities.find((entity) => entity.team !== world.playerTeam)!;
    const hit = (targetId = mech.id): SimEvent => ({
      type: 'projectile_hit', tick: world.tick, shooterId: enemy.id, targetId,
      weaponId: 'test_weapon', location: 'centre_torso', damage: 10, arc: 'front',
    });
    beginFieldRadio(world);
    observeFieldRadio(world, [hit(enemy.id), hit(enemy.id), hit(enemy.id)]);
    expect(readRadioMessage()).toBeNull();
    observeFieldRadio(world, [hit(), hit()]);
    expect(readRadioMessage()).toBeNull();
    world.tick += Math.ceil((FIELD_RADIO.pressure.windowSeconds + 1) / world.dt);
    observeFieldRadio(world, [hit()]);
    expect(readRadioMessage()).toBeNull();
    observeFieldRadio(world, [hit(), hit()]);
    expect(readRadioMessage()).toMatchObject({ text: 'Cargo is taking a beating. Could use an escort.', priority: 'routine' });
    dismissRadio(readRadioMessage()!.id);
    world.tick += Math.ceil(FIELD_RADIO.routineGapSeconds / world.dt);
    observeFieldRadio(world, [hit(), hit(), hit()]);
    expect(readRadioMessage()).toBeNull();
    world.tick += Math.ceil(FIELD_RADIO.pressure.cooldownSeconds / world.dt);
    observeFieldRadio(world, [hit(), hit(), hit()]);
    expect(readRadioMessage()?.text).toBe('This truck has enough dents. Somebody cover the cab.');
  });

  it('does not repeat an engagement acknowledgement after an attack order was already answered', () => {
    const world = playerWorld('radio-engagement-order');
    const mech = unitOf(world, 'bulwark_assault');
    beginFieldRadio(world);
    pilotOrder(world, mech, 'attack');
    dismissRadio(readRadioMessage()!.id);
    world.tick += 1000;
    observeFieldRadio(world, [{ type: 'weapon_fired', tick: world.tick, shooterId: mech.id, targetId: 999, weaponId: 'test_weapon' }]);
    expect(readRadioMessage()).toBeNull();
  });

  it('never lets pressure chatter displace a story report or an urgent injury in the same batch', () => {
    const world = playerWorld('radio-priorities');
    const mech = unitOf(world, 'bulwark_assault');
    const hit: SimEvent = { type: 'projectile_hit', tick: 0, shooterId: 999, targetId: mech.id,
      weaponId: 'test_weapon', location: 'centre_torso', damage: 10, arc: 'front' };
    beginFieldRadio(world);
    observeFieldRadio(world, [hit, hit, hit, { type: 'mission_message', tick: 0, text: 'Protect the convoy.' }]);
    expect(readRadioMessage()).toMatchObject({ priority: 'story', text: 'Protect the convoy.' });
    observeFieldRadio(world, [hit, hit, hit, { type: 'pilot_injured', tick: 0, entityId: mech.id, wounds: 1 }]);
    expect(readRadioMessage()).toMatchObject({ priority: 'urgent', text: FIELD_RADIO.alerts.pilot_injured });
  });
});
