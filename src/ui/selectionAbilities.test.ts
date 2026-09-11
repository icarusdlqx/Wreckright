import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { snapshotUnit } from './snapshot';
import { selectionAbilities, SelectionAbilityDetails } from './selectionAbilities';
import { CommandPalette } from './CommandPalette';

it('counts ready members and explains mixed abilities and unavailable pilots', () => {
  const world = playerWorld('mixed-pilot-abilities');
  const units = world.entities.filter((entity) => entity.team === 0).slice(0, 3).map((entity) => snapshotUnit(world, entity));
  units[0]!.ability = { label: 'Sensor Sweep', note: 'Extend instrument range.', ready: true, activeRemaining: 0, cooldownRemaining: 0 };
  units[1]!.ability = { label: 'Coolant Flush', note: 'Dump stored heat.', ready: false, activeRemaining: 0, cooldownRemaining: 12 };
  units[2]!.ability = { label: 'Brace', note: 'Steady incoming impacts.', ready: false, activeRemaining: 0, cooldownRemaining: 0 };
  const summary = selectionAbilities(units, units.map((unit) => unit.id), 0)!;
  expect(summary.ready).toBe(1);
  expect(summary.total).toBe(3);
  const html = renderToStaticMarkup(createElement(SelectionAbilityDetails, { summary }));
  expect(html).toContain('1/3 pilot abilities ready');
  expect(html).toContain('Sensor Sweep');
  expect(html).toContain('12s COOLDOWN');
  expect(html).toContain('UNAVAILABLE');
  expect(html).toContain('Dump stored heat.');
  const commands = renderToStaticMarkup(createElement(CommandPalette, {
    orderMode: null, enabled: true, holdingFire: false, heatSafety: true,
    ability: units[0]!.ability, abilitySelection: summary, alpha: null, jump: null, posture: 'free', onCommand: () => undefined,
  }));
  expect(commands).toContain('1/3 READY');
  expect(commands).toContain('Activate 1/3 ready pilot abilities');
});

describe('ability selection eligibility', () => {
  it('keeps the individual readout for one pilot and excludes hostile or lost units', () => {
    const world = playerWorld();
    const units = world.entities.map((entity) => snapshotUnit(world, entity));
    const friendly = units.find((unit) => unit.team === 0)!;
    expect(selectionAbilities(units, [friendly.id], 0)).toBeNull();
    for (const unit of units) if (unit.id !== friendly.id) unit.alive = false;
    expect(selectionAbilities(units, units.map((unit) => unit.id), 0)).toBeNull();
  });
});
