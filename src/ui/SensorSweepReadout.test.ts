import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { SensorSweepReadout, sensorSweepStatus } from './SensorSweepReadout';

describe('sensor sweep readout', () => {
  it('shows friendly remaining coverage and ignores enemy sweeps', () => {
    const world = playerWorld('sensor-sweep-readout');
    const player = world.playerTeam ?? 0;
    world.tick = 40;
    world.reveals = [
      { team: player, kind: 'sensor', x: 100, y: 100, radius: 260, expiresTick: 91 },
      { team: player + 1, kind: 'sensor', x: 100, y: 100, radius: 260, expiresTick: 200 },
    ];

    expect(sensorSweepStatus(world)).toEqual({ count: 1, remainingSeconds: 3 });
    world.tick += 20;
    expect(sensorSweepStatus(world)).toEqual({ count: 1, remainingSeconds: 2 });
    const html = renderToStaticMarkup(createElement(SensorSweepReadout, { world }));
    expect(html).toContain('Sensor sweep');
    expect(html).toContain('2s remaining');
  });

  it('disappears when the last sweep expires', () => {
    const world = playerWorld('sensor-sweep-expired');
    world.reveals = [{
      team: world.playerTeam ?? 0,
      kind: 'sensor',
      x: 100,
      y: 100,
      radius: 260,
      expiresTick: world.tick,
    }];
    expect(sensorSweepStatus(world)).toBeNull();
    expect(renderToStaticMarkup(createElement(SensorSweepReadout, { world }))).toBe('');
  });
});
