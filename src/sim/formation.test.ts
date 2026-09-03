import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { FORMATION_PRESET_IDS, formationDestinations } from './formation';
import type { MechEntity, Vec2, World } from './types';
import { createWorld } from './world';

function battle(seed: string): { world: World; units: MechEntity[] } {
  const world = createWorld(catalog, { missionId: 'skirmish_ridge', playerTeam: 0, seed });
  return { world, units: world.entities.filter((entity) => entity.team === 0) };
}

function centreOf(units: readonly MechEntity[]): Vec2 {
  return units.reduce(
    (sum, unit) => ({ x: sum.x + unit.pos.x / units.length, y: sum.y + unit.pos.y / units.length }),
    { x: 0, y: 0 },
  );
}

describe('formation layout in the simulation', () => {
  it('lays a group out the same way every time from the same field', () => {
    const first = battle('formation-sim');
    const second = battle('formation-sim');
    const to = { x: centreOf(first.units).x + 200, y: centreOf(first.units).y };
    for (const preset of FORMATION_PRESET_IDS) {
      expect([...formationDestinations(first.world, first.units, to, preset)]).toEqual([
        ...formationDestinations(second.world, second.units, to, preset),
      ]);
    }
  });

  it('gives every machine its own endpoint', () => {
    const { world, units } = battle('formation-slots');
    const to = { x: centreOf(units).x + 200, y: centreOf(units).y };
    const slots = formationDestinations(world, units, to, 'line');
    expect(slots.size).toBe(units.length);
    const keys = new Set([...slots.values()].map((at) => `${at.x}:${at.y}`));
    expect(keys.size).toBe(units.length);
  });
});
