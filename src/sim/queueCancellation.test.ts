import { describe, expect, it } from 'vitest';
import { playerWorld, unitOf } from '../../tests/support';
import { issueMove, issueStop, setPosture, updatePlayerControl } from './orders';

describe('route cancellation', () => {
  it.each(['guard', 'return_fire', 'stop'] as const)(
    '%s cancels queued legs before a new shifted route', (command) => {
      const world = playerWorld(`cancel-route-${command}`);
      const mech = unitOf(world, 'sentinel_brawler');
      expect(issueMove(world, mech, { x: 400, y: 600 }, false)).toBe(true);
      expect(issueMove(world, mech, { x: 500, y: 600 }, false, { queued: true })).toBe(true);
      expect(mech.orders.queue).toHaveLength(1);

      if (command === 'stop') issueStop(mech);
      else setPosture(mech, command === 'guard' ? 'hold_position' : command);

      expect(mech.orders.move).toBeNull();
      expect(mech.orders.queue).toEqual([]);
      expect(issueMove(world, mech, { x: 400, y: 700 }, false, { queued: true })).toBe(true);
      mech.pos = { ...mech.orders.move!.to };
      updatePlayerControl(world, mech);
      expect(mech.orders.move).toBeNull();
      expect(mech.orders.queue).toEqual([]);
      expect(mech.path).toEqual([]);
    },
  );

  it('still promotes untouched queued legs after normal arrival', () => {
    const world = playerWorld('route-arrival');
    const mech = unitOf(world, 'sentinel_brawler');
    issueMove(world, mech, { x: 400, y: 600 }, false);
    issueMove(world, mech, { x: 500, y: 600 }, false, { queued: true });
    issueMove(world, mech, { x: 600, y: 600 }, false, { queued: true });
    mech.pos = { ...mech.orders.move!.to };
    updatePlayerControl(world, mech);
    expect(mech.orders.move?.to).toEqual({ x: 500, y: 600 });
    expect(mech.orders.queue.map((order) => order.to)).toEqual([{ x: 600, y: 600 }]);
  });
});
