import { describe, expect, it, vi } from 'vitest';
import { playerWorld } from '../../tests/support';
import { FIELD_RADIO } from '../schema/fieldRadio';
import { PILOT_CONTINUITY } from '../schema/pilotContinuity';
import { attachFieldRadioMemories, beginFieldRadio, dismissRadio, observeFieldRadio, pilotOrder, readRadioMessage } from './fieldRadio';

function nextGap(world: ReturnType<typeof playerWorld>): void {
  const visible = readRadioMessage();
  if (visible !== null) dismissRadio(visible.id);
  world.tick += Math.ceil(FIELD_RADIO.routineGapSeconds / world.dt);
}

describe('field radio campaign memories', () => {
  it('does not consume a memory while a mission report or urgent report is occupying the channel', () => {
    const world = playerWorld('memory-priority');
    const pilot = world.entities.find((entry) => entry.team === world.playerTeam)!;
    const heard = vi.fn();
    beginFieldRadio(world);
    attachFieldRadioMemories(world, [{ entityId: pilot.id, trigger: 'move', text: 'Back from the ward.', onHeard: heard }]);
    observeFieldRadio(world, [{ type: 'mission_message', tick: 0, text: 'Keep the workshop safe.' }]);
    pilotOrder(world, pilot, 'move');
    expect(heard).not.toHaveBeenCalled();
    expect(readRadioMessage()?.text).toBe('Keep the workshop safe.');
    nextGap(world);
    observeFieldRadio(world, [{ type: 'pilot_injured', tick: world.tick, entityId: pilot.id, wounds: 1 }]);
    pilotOrder(world, pilot, 'move');
    expect(heard).not.toHaveBeenCalled();
    nextGap(world);
    pilotOrder(world, pilot, 'move');
    expect(readRadioMessage()?.text).toBe('Back from the ward.');
    expect(heard).toHaveBeenCalledOnce();
    nextGap(world);
    pilotOrder(world, pilot, 'move');
    expect(readRadioMessage()?.text).not.toBe('Back from the ward.');
    expect(heard).toHaveBeenCalledOnce();
  });

  it('waits for the actual recovered weapon to fire and only marks a displayed remark', () => {
    const world = playerWorld('memory-shot');
    const pilot = world.entities.find((entry) => entry.team === world.playerTeam)!;
    const heard = vi.fn();
    beginFieldRadio(world);
    attachFieldRadioMemories(world, [{ entityId: pilot.id, trigger: 'weapon', weaponId: 'captured_gun',
      text: 'Better on this side.', onHeard: heard }]);
    pilotOrder(world, pilot, 'attack');
    expect(heard).not.toHaveBeenCalled();
    nextGap(world);
    const shot = (weaponId: string) => ({ type: 'weapon_fired' as const, tick: world.tick, shooterId: pilot.id, targetId: 999, weaponId });
    observeFieldRadio(world, [shot('original_gun')]);
    expect(heard).not.toHaveBeenCalled();
    observeFieldRadio(world, [shot('captured_gun')]);
    expect(readRadioMessage()?.text).toBe('Better on this side.');
    expect(heard).toHaveBeenCalledOnce();
    nextGap(world);
    observeFieldRadio(world, [shot('captured_gun')]);
    expect(readRadioMessage()).toBeNull();
    expect(heard).toHaveBeenCalledOnce();
  });

  it('limits recollections across the whole lance and resets only for a different field', () => {
    const world = playerWorld('memory-cap');
    const pilots = world.entities.filter((entry) => entry.team === world.playerTeam);
    const heard = vi.fn();
    beginFieldRadio(world);
    attachFieldRadioMemories(world, pilots.map((pilot) => ({ entityId: pilot.id, trigger: 'move' as const,
      text: `Memory ${pilot.id}`, onHeard: heard })));
    for (const pilot of pilots) {
      pilotOrder(world, pilot, 'move');
      nextGap(world);
    }
    expect(heard).toHaveBeenCalledTimes(PILOT_CONTINUITY.maxPerMission);
    beginFieldRadio(world);
    pilotOrder(world, pilots[0]!, 'move');
    expect(readRadioMessage()?.text).not.toContain('Memory');
  });

  it('does not give a memory line to an enemy, ejected pilot, or stale world', () => {
    const world = playerWorld('memory-owner');
    const friend = world.entities.find((entry) => entry.team === world.playerTeam)!;
    const enemy = world.entities.find((entry) => entry.team !== world.playerTeam)!;
    const heard = vi.fn();
    beginFieldRadio(world);
    attachFieldRadioMemories(world, [friend, enemy].map((pilot) => ({ entityId: pilot.id, trigger: 'move' as const, text: 'Memory', onHeard: heard })));
    pilotOrder(world, enemy, 'move');
    friend.pilot.ejected = true;
    pilotOrder(world, friend, 'move');
    expect(heard).not.toHaveBeenCalled();
    beginFieldRadio(playerWorld('new-memory-owner'));
    friend.pilot.ejected = false;
    pilotOrder(world, friend, 'move');
    expect(heard).not.toHaveBeenCalled();
  });
});
