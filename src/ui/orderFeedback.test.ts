import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { DROPPED_PULSE_MS, ORDER_PULSE_MS, OrderFeedback } from './orderFeedback';

describe('order feedback marks', () => {
  it('pulses where an order landed and fades it out over its life', () => {
    let now = 0;
    const feedback = new OrderFeedback(() => now);
    feedback.markOrder({ x: 120, y: 240 });

    now = ORDER_PULSE_MS / 2;
    const [mid] = feedback.views();
    expect(mid).toMatchObject({ at: { x: 120, y: 240 }, kind: 'order' });
    expect(mid?.progress).toBeCloseTo(0.5);

    now = ORDER_PULSE_MS + 1;
    expect(feedback.views()).toEqual([]);
  });

  it('marks the ground where one of the player\'s routes was given up', () => {
    let now = 0;
    const feedback = new OrderFeedback(() => now);
    const world = playerWorld('dropped-mark');
    const mine = world.entities.find((entity) => entity.team === 0);
    const theirs = world.entities.find((entity) => entity.team !== 0);
    if (mine === undefined || theirs === undefined) throw new Error('need both sides');

    feedback.consume(world, [
      { type: 'order_dropped', tick: 1, entityId: mine.id, x: 10, y: 20 },
      { type: 'order_dropped', tick: 1, entityId: theirs.id, x: 30, y: 40 },
    ]);

    const views = feedback.views();
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ at: { x: 10, y: 20 }, kind: 'dropped' });

    now = DROPPED_PULSE_MS + 1;
    expect(feedback.views()).toEqual([]);
  });
});
