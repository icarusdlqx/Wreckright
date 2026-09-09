import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { PilotStats, pilotStats, pilotSpecialityEffects } from './PilotStats';
import { PilotAbilityReadout, pilotAbilitySummary } from './PilotAbilityReadout';

describe('native pilot skills and abilities', () => {
  it.each([...catalog.pilots.values()])('shows $name with the same three levels used for training', (pilot) => {
    const stats = pilotStats(catalog, pilot);
    expect(stats.map((stat) => stat.label)).toEqual(['Gunnery', 'Piloting', 'Sensors']);
    expect(stats.map((stat) => stat.score)).toEqual([pilot.gunnery, pilot.piloting, pilot.sensors]);
    const html = renderToStaticMarkup(createElement(PilotStats, { catalog, pilot }));
    expect(html).not.toContain('/10');
    expect(html).not.toContain('Killer');
    expect(html).not.toContain('Nerve');
    expect(html.match(/class="stat-pips"/g)).toHaveLength(3);
    expect(html.match(/data-filled="true"/g)).toHaveLength(pilot.gunnery + pilot.piloting + pilot.sensors);
  });

  it('reports critical and casualty modifiers separately without rating them as skills', () => {
    const pilot = { gunnery: 3, piloting: 3, sensors: 3, traits: ['butcher', 'hard_to_kill'] };
    expect(pilotSpecialityEffects(catalog, pilot)).toEqual(['+60% critical-hit chance', '−50% fatality risk after mech loss']);
    const html = renderToStaticMarkup(createElement(PilotStats, { catalog, pilot }));
    expect(html).toContain('aria-label="Speciality effects"');
    expect(html).toContain('fatality risk after mech loss');
  });

  it('describes the actual first matching trait ability, including its cooldown', () => {
    const pilot = { traits: ['spotter', 'marksman'] };
    const summary = pilotAbilitySummary(catalog, pilot)!;
    expect(summary.id).toBe('sensor_sweep');
    expect(summary.effects).toEqual(['+100% sensor range']);
    expect(summary.timing).toContain(`${catalog.rules.abilities.cooldownSeconds}s recharge`);
    const html = renderToStaticMarkup(createElement(PilotAbilityReadout, { catalog, pilot }));
    expect(html).toContain('Sensor Sweep');
    expect(html).not.toContain('Aimed Volley');
    expect(pilotAbilitySummary(catalog, { traits: [] })?.id).toBe(catalog.rules.abilities.default);
  });

  it('describes an instantaneous coolant ability as shedding current heat', () => {
    const summary = pilotAbilitySummary(catalog, { traits: ['cool_hand'] })!;
    expect(summary.effects).toEqual(['Sheds 55% current heat']);
    expect(summary.timing).toContain('Instant');
  });
});
