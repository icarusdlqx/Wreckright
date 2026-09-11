import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { LanceBar } from './LanceBar';
import { lanceStatus, unitIntegrity } from './lanceCardState';
import { snapshotUnit, snapshotUnits } from './snapshot';

describe('persistent pilot command cards', () => {
  it('retains authored pilot and chassis identity through damage and changed weapons', () => {
    const world = playerWorld('pilot-card-identity');
    const unit = world.entities.find(entity => entity.team === world.playerTeam)!;
    const before = snapshotUnit(world, unit);
    unit.weapons.length = 0;
    unit.locations.left_arm.destroyed = true;
    unit.pilot.wounds = 2;
    const after = snapshotUnit(world, unit);
    expect(after.pilotId).toBe(unit.pilot.id);
    expect(after.pilotId).toBe(before.pilotId);
    expect(after.chassisId).toBe(before.chassisId);
    expect(after.pilotState).toEqual({ dead: false, ejected: false, wounds: 2 });
    expect(unitIntegrity(after)).toBeLessThan(unitIntegrity(before));
  });

  it('does not present mech destruction as pilot death', () => {
    const world = playerWorld('pilot-card-survival');
    const unit = world.entities.find(entity => entity.team === world.playerTeam)!;
    unit.destroyed = true;
    unit.killMethod = 'centre_torso';
    expect(lanceStatus(snapshotUnit(world, unit))).toBe('Mech destroyed');
    expect(unitIntegrity(snapshotUnit(world, unit))).toBe(0);
    unit.pilot.ejected = true;
    expect(lanceStatus(snapshotUnit(world, unit))).toBe('Pilot ejected');
    unit.pilot.dead = true;
    expect(lanceStatus(snapshotUnit(world, unit))).toBe('Pilot KIA');
  });

  it('keeps disabled and withdrawn pilot cards in their deployment positions', () => {
    const world = playerWorld('pilot-card-order');
    const units = world.entities.filter(unit => unit.team === world.playerTeam);
    const order = units.map(unit => unit.id);
    units[0]!.destroyed = true;
    units[1]!.withdrawn = true;
    const snapshots = snapshotUnits(world, world.playerTeam!).units;
    expect(snapshots.map(unit => unit.id)).toEqual(order);
    const markup = renderToStaticMarkup(createElement(LanceBar, {
      units: snapshots, selection: [units.at(-1)!.id], onSelect: () => {},
    }));
    const actualOrder = [...markup.matchAll(/data-testid="lance-card-(\d+)"/g)].map(match => Number(match[1]));
    expect(actualOrder).toEqual(order);
    expect(markup).toContain('Mech destroyed');
    expect(markup).toContain('Withdrawn');
    expect(markup).not.toContain('Pilot KIA');
    expect(markup.match(/class="pilot-portrait/g)?.length).toBe(snapshots.length);
  });
});
