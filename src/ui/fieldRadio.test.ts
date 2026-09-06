import { describe, expect, it } from 'vitest';
import { playerWorld, unitOf } from '../../tests/support';
import { beginFieldRadio, dismissRadio, endFieldRadio, observeFieldRadio, pilotOrder, readRadioMessage } from './fieldRadio';

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

  it('resolves authored speakers from the catalog without exposing live hostile state', () => {
    const world = playerWorld('radio-speaker');
    beginFieldRadio(world);
    const speaker = [...world.catalog.pilots.values()][0]!;
    observeFieldRadio(world, [{ type: 'mission_message', tick: 0, text: 'Public transmission.', speakerPilotId: speaker.id }]);
    expect(readRadioMessage()).toMatchObject({ speaker: speaker.name, pilot: { id: speaker.id }, priority: 'story' });
    expect(pilotOrder(world, unitOf(world, 'bulwark_assault'), 'move')).toBeUndefined();
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
});
