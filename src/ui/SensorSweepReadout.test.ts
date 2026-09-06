import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { useAbility } from '../sim/abilities';
import { effectiveSensorRange } from '../sim/sensors';
import { SensorSweepReadout, sensorSweepStatus, mechSensorSweepStatus } from './SensorSweepReadout';

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

  it('shows the pilot sweep immediately, with current-weather range and no support call required', () => {
    const world = playerWorld('pilot-sweep-readout');
    const scout = world.entities.find(entity => entity.team === world.playerTeam)!;
    scout.ability.id = 'sensor_sweep';
    world.atmosphere = { ...world.atmosphere, mechanics: { ...world.atmosphere.mechanics, sensorFactor: 0.9 } };
    const normalRange = effectiveSensorRange(world, scout);
    expect(mechSensorSweepStatus(world)).toBeNull();
    expect(useAbility(world, scout)).toBe(true);
    const duration = world.rules.abilities.entries.sensor_sweep!.durationSeconds;
    expect(mechSensorSweepStatus(world)).toEqual({ count: 1, remainingSeconds: duration,
      maximumRange: Math.round(effectiveSensorRange(world, scout)) });
    expect(effectiveSensorRange(world, scout)).toBeGreaterThan(normalRange);
    expect(world.reveals).toEqual([]);
    const html = renderToStaticMarkup(createElement(SensorSweepReadout, { world }));
    expect(html).toContain('mech-sensor-sweep-readout');
    expect(html).toContain('Mech Sensor Sweep');
    expect(html).toContain(`${duration}s remaining`);
    expect(html).toContain('instrument range');
    expect(html).toContain('optics required for direct fire');
  });

  it('ignores hostile, destroyed and unrelated abilities and removes expired pilot sweeps', () => {
    const world = playerWorld('pilot-sweep-lifecycle');
    const friendly = world.entities.find(entity => entity.team === world.playerTeam)!;
    const hostile = world.entities.find(entity => entity.team !== world.playerTeam)!;
    hostile.ability.id = 'sensor_sweep';
    expect(useAbility(world, hostile)).toBe(true);
    friendly.ability.id = 'steady_aim';
    expect(useAbility(world, friendly)).toBe(true);
    expect(mechSensorSweepStatus(world)).toBeNull();
    friendly.ability.id = 'sensor_sweep';
    expect(mechSensorSweepStatus(world)?.count).toBe(1);
    friendly.destroyed = true;
    expect(mechSensorSweepStatus(world)).toBeNull();
    friendly.destroyed = false;
    world.tick = friendly.ability.activeUntilTick;
    expect(mechSensorSweepStatus(world)?.remainingSeconds).toBe(1);
    world.tick += 1;
    expect(mechSensorSweepStatus(world)).toBeNull();
    expect(renderToStaticMarkup(createElement(SensorSweepReadout, { world }))).toBe('');
  });

  it('counts only current coarse returns and never prints hidden machine or pilot identities', () => {
    const world = playerWorld('sweep-safe-count');
    const scout = world.entities.find(entity => entity.team === world.playerTeam)!;
    const hostile = world.entities.find(entity => entity.team !== world.playerTeam)!;
    scout.ability.id = 'sensor_sweep';
    expect(useAbility(world, scout)).toBe(true);
    const vision = world.vision!;
    vision.visible.clear(); vision.detected.clear(); vision.tracks.clear();
    vision.tracks.set(hostile.id, { id: hostile.id, team: hostile.team, frame: hostile.frame,
      chassisClass: hostile.chassisClass, pos: { x: 504, y: 504 }, tick: world.tick, source: 'sensor' });
    const render = () => renderToStaticMarkup(createElement(SensorSweepReadout, { world }));
    expect(render()).toContain('0 live sensor returns');
    vision.detected.add(hostile.id);
    const html = render();
    expect(html).toContain('1 live sensor return');
    expect(html).not.toContain(hostile.pilot.name);
    expect(html).not.toContain(hostile.chassisId);
    vision.visible.add(hostile.id);
    expect(render()).toContain('0 live sensor returns');
  });
});
