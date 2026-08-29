import { describe, expect, it } from 'vitest';
import { testWorld } from '../../tests/support';
import { eventsOfType } from './events';
import { updateSupport } from './support';
import type { World } from './types';

function parkUnitsAway(world: World): void {
  for (const [index, entity] of world.entities.entries()) {
    entity.pos = { x: -10_000 - index * 100, y: -10_000 };
  }
}

describe('support ground impacts', () => {
  it('emits exact scattered artillery points without changing the RNG sequence', () => {
    const world = testWorld('artillery-impact-points');
    const reference = testWorld('artillery-impact-points');
    parkUnitsAway(world);
    parkUnitsAway(reference);
    world.events.length = 0;
    const target = world.terrain.tileCentre(30, 8);
    const team = 0;
    world.support.pending.push({
      call: 'artillery_strike',
      team,
      target,
      heading: 0,
      resolveTick: world.tick,
    });

    const config = reference.rules.support.artillery_strike;
    const expected = [];
    for (let shot = 0; shot < config.shots; shot += 1) {
      const angle = reference.rng.range(0, Math.PI * 2);
      const spread = reference.rng.range(0, config.scatter);
      expected.push({
        x: target.x + Math.cos(angle) * spread,
        y: target.y + Math.sin(angle) * spread,
      });
    }

    updateSupport(world);

    const impacts = eventsOfType(world.events, 'ground_impact');
    expect(impacts.map(({ x, y }) => ({ x, y }))).toEqual(expected);
    expect(impacts.every((event) => event.kind === 'artillery' && event.team === team)).toBe(true);
    expect(world.rng.save()).toEqual(reference.rng.save());
    expect(eventsOfType(world.events, 'support_resolved')).toEqual([{
      type: 'support_resolved',
      tick: world.tick,
      team,
      call: 'artillery_strike',
      x: target.x,
      y: target.y,
    }]);

    const burnableImpacts = impacts.filter((impact) => {
      const tile = world.terrain.toTile(impact);
      const id = world.terrain.idAt(tile.column, tile.row);
      return id !== null && world.rules.terrain.fire.burnsTo[id] !== undefined;
    });
    expect(burnableImpacts.length).toBeGreaterThan(0);
    expect(world.fire.pendingIgnitions).toEqual(burnableImpacts.map((impact) => {
      const tile = world.terrain.toTile(impact);
      return {
        cell: tile.row * world.terrain.width + tile.column,
        source: 'artillery_impact',
        chance: world.rules.terrain.fire.ignitionChance.artilleryImpact,
      };
    }));
  });
});
