import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { createWorld, runBattle, type LanceEntry } from './world';
import { spawnUnits } from './triggers';

const entry = (designId: string, pilotId: string): LanceEntry => ({
  design: catalog.designs.get(designId)!, pilot: catalog.pilots.get(pilotId)!,
});
const options = { seed: 'independent-forces', missionId: 'skirmish_ridge', playerTeam: 0 };

describe('skirmish force overrides', () => {
  it('places every new map preset on passable ground', () => {
    for (const mission of catalog.missions.values()) {
      if (!mission.id.startsWith('skirmish_')) continue;
      const world = createWorld(catalog, { ...options, missionId: mission.id });
      for (const entity of world.entities) {
        const tile = world.terrain.toTile(entity.pos);
        expect(world.terrain.passable(tile.column, tile.row), `${mission.id}: ${entity.id}`).toBe(true);
      }
    }
  });
  it('fields exactly the selected designs and pilots on each side', () => {
    const player = entry('hornet_spotter', 'kessa_vale');
    const enemy = entry('votive_picket', 'petra_lindqvist');
    const world = createWorld(catalog, { ...options, playerLance: [player], enemyLance: [enemy] });
    expect(world.entities).toHaveLength(2);
    expect(world.entities.map((entity) => [entity.team, entity.designId, entity.pilot.id])).toEqual([
      [0, player.design.id, player.pilot.id], [1, enemy.design.id, enemy.pilot.id],
    ]);
    expect(world.entities.map((entity) => entity.controller)).toEqual(['orders', 'tactical']);
  });

  it('applies each side experience independently and leaves the catalog unchanged', () => {
    const pilot = catalog.pilots.get('kessa_vale')!;
    const friendly = entry('hornet_spotter', pilot.id);
    const world = createWorld(catalog, { ...options, playerLance: [friendly], enemyLance: [friendly],
      playerDifficulty: 'elite', difficulty: 'green' });
    expect(world.entities[0]!.pilot.gunnery).toBe(Math.min(5, pilot.gunnery + catalog.rules.difficulty.tiers.elite!.skillDelta));
    expect(world.entities[1]!.pilot.gunnery).toBe(Math.max(1, pilot.gunnery + catalog.rules.difficulty.tiers.green!.skillDelta));
    expect(world.difficulty).toBe('green');
    expect(catalog.pilots.get(pilot.id)).toBe(pilot);
    const campaignWorld = createWorld(catalog, { ...options, playerLance: [friendly], difficulty: 'elite' });
    expect(campaignWorld.entities[0]!.pilot.gunnery).toBe(pilot.gunnery);
  });

  it('retains the selected player experience for a later reinforcement', () => {
    const world = createWorld(catalog, { ...options, difficulty: 'green', playerDifficulty: 'elite' });
    const unit = catalog.missions.get('skirmish_ridge')!.lances[0]!.units[0]!;
    const spawned = spawnUnits(world, 0, [unit]);
    expect(spawned[0]!.pilot.gunnery).toBe(world.entities[0]!.pilot.gunnery);
  });

  it('rejects an explicitly empty enemy force rather than granting an instant victory', () => {
    expect(() => createWorld(catalog, { ...options, enemyLance: [] })).toThrow(/at least one/);
  });

  it('replays the same customized battle deterministically', () => {
    const selected = { ...options, maxTicks: 400, playerDifficulty: 'veteran', difficulty: 'green',
      playerController: 'tactical' as const, playerLance: [entry('hornet_spotter', 'kessa_vale')],
      enemyLance: [entry('votive_picket', 'petra_lindqvist')] };
    expect(runBattle(catalog, selected)).toEqual(runBattle(catalog, selected));
  });
});
