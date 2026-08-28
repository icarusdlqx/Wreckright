import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { snapshotUnit } from './snapshot';
import { TacticalReadout } from './TacticalReadout';

describe('TacticalReadout', () => {
  it('puts the selected pilot and reactor decisions into the panel', () => {
    const world = playerWorld('readout-panel');
    const mech = world.entities.find((entity) => entity.team === 0);
    if (mech === undefined) throw new Error('no player mech');
    const moonlit = world.catalog.atmospheres.get('moonlit_night');
    if (moonlit === undefined) throw new Error('no moonlit atmosphere');
    world.atmosphere = moonlit;
    mech.ability.id = 'aimed_volley';
    mech.ability.readyAtTick = world.tick + Math.round(5 / world.dt);
    mech.heat = mech.heatCapacity * 0.99;
    mech.groupIntent[1] = true;
    mech.groupEnabled[1] = false;

    const unit = snapshotUnit(world, mech);
    const html = renderToStaticMarkup(
      createElement(TacticalReadout, { unit, friendly: true }),
    );

    expect(html).toContain('Aimed Volley');
    expect(html).toContain('5.0s COOLDOWN');
    expect(html).toContain('Stability');
    expect(html).toContain('forced-shutdown band');
    expect(html).toContain('SHEDDING G2');
    expect(html).toContain(`${unit.role} · ${unit.frameClass}`);
    expect(html).toContain(unit.chassisSummary);
    expect(unit.sightRange).toBeCloseTo(mech.sightRange * 0.85);
    expect(unit.sensorRange).toBeCloseTo(mech.sensorRange * 0.95);
    expect(html).toContain(`${Math.round(unit.sightRange)}m current`);
    expect(html).toContain(`${Math.round(unit.sensorRange)}m current reach`);
    expect(html).toContain('Current weather is included');
    expect(html).toContain('Sensor returns do not provide line of sight');

    const hostile = renderToStaticMarkup(createElement(TacticalReadout, { unit }));
    expect(hostile).not.toContain('Friendly machine profile');
    expect(hostile).not.toContain(unit.chassisSummary);
  });
});
