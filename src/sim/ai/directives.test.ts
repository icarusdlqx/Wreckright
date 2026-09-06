import { describe, expect, it } from 'vitest';
import { catalog, makeGrid, OPEN_LEGEND, spawnDesign } from '../../../tests/support';
import { MissionSchema, type EnemyDirective } from '../../schema/mission';
import { setHoldFire, setPosture } from '../orders';
import { updateTeamVisions, visionFor } from '../sensors';
import { createWorld, stepWorld } from '../world';
import { difficultyTier, runTeamAi } from './tactical';
import { assignDirectives } from './directives';
import { distance } from '../math';

function field(behavior: EnemyDirective['behavior'] = 'defend') {
  const authored = catalog.missions.get('skirmish_ridge')!;
  const mission = MissionSchema.parse({ ...authored,
    zones: [{ id: 'reader', name: 'Reader', x: 505, y: 305, radius: 60,
      owner: 1, captureSeconds: 2, resourcePoints: 0 }],
    objectives: [{ id: 'survive', label: 'Remain operational', type: 'survive', team: 0, required: true }],
    triggers: [],
    enemyDirectives: [{ id: 'reader_duty', team: 1, zoneId: 'reader', behavior, units: 1, pursuitRadius: 250 }],
  });
  const world = createWorld({ ...catalog, missions: new Map(catalog.missions).set(mission.id, mission) },
    { seed: 'directed-mission', missionId: mission.id, playerTeam: 0 });
  world.terrain = makeGrid({ tiles: Array<string>(60).fill('.'.repeat(100)), legend: OPEN_LEGEND });
  world.entities = [];
  const defender = spawnDesign(world, 'rivet_escort', 1, { x: 505, y: 305 });
  const target = spawnDesign(world, 'hornet_spotter', 0, { x: 705, y: 305 });
  target.controller = 'orders'; target.autopilot = false;
  setPosture(target, 'hold_position'); setHoldFire(target, true);
  for (const unit of world.entities) unit.sightRange = 1000;
  updateTeamVisions(world);
  return { world, defender, target, zone: world.zones[0]! };
}

describe('authored enemy duties', () => {
  it('leaves a mission with no directives and its random stream untouched', () => {
    const { world } = field();
    world.mission.enemyDirectives = [];
    const before = JSON.stringify(world.entities);
    expect(assignDirectives(world, 1).size).toBe(0);
    expect(JSON.stringify(world.entities)).toBe(before);
    expect(world.rng.next()).toBe(field().world.rng.next());
  });

  it('retains assigned mobile defenders as other units become nearer', () => {
    const { world, defender, zone } = field();
    const extra = spawnDesign(world, 'rivet_escort', 1, { x: 805, y: 305 });
    const turret = spawnDesign(world, 'redoubt_emplacement', 1, zone);
    expect([...assignDirectives(world, 1).keys()]).toEqual([defender.id]);
    defender.pos = { x: 645, y: 305 };
    extra.pos = { x: 505, y: 305 };
    world.entities.reverse();
    expect([...assignDirectives(world, 1).keys()]).toEqual([defender.id]);
    defender.destroyed = true;
    expect([...assignDirectives(world, 1).keys()]).toEqual([extra.id]);
    expect(assignDirectives(world, 1).has(turret.id)).toBe(false);
  });

  it('defends the reader instead of chasing a visible decoy outside its leash', () => {
    const { world, defender, target } = field();
    target.pos = { x: 825, y: 305 };
    updateTeamVisions(world);
    runTeamAi(world, 1, difficultyTier(world, 'regular'));
    expect(defender.targetId).toBeNull();
    expect(defender.path).toEqual([]);
    expect(defender.ai.stance).toBe('hold');
  });

  it('recaptures a player-owned objective with ordinary movement and capture rules', () => {
    const { world, defender, target, zone } = field('retake');
    zone.owner = 0;
    defender.pos = { x: 805, y: 305 };
    target.pos = { x: 105, y: 105 };
    updateTeamVisions(world);
    runTeamAi(world, 1, difficultyTier(world, 'regular'));
    expect(defender.ai.destination).toEqual({ x: zone.x, y: zone.y });
    for (let tick = 0; tick < 500 && zone.owner !== 1; tick += 1) stepWorld(world, 2000);
    expect(zone.owner).toBe(1);
    expect(world.objectives.map((objective) => objective.id)).toEqual(['survive']);
    expect(world.missionStatus).toBe('active');
  });

  it('intercepts an observed approach, then returns when the contact leaves its pursuit area', () => {
    const { world, defender, target, zone } = field('intercept');
    runTeamAi(world, 1, difficultyTier(world, 'regular'));
    expect(defender.targetId).toBe(target.id);
    expect(defender.path.length).toBeGreaterThan(0);
    expect(distance(defender.ai.destination!, target.pos)).toBeLessThan(distance(defender.pos, target.pos));
    expect(distance(defender.ai.destination!, zone)).toBeLessThanOrEqual(250);
    defender.pos = { x: 645, y: 305 };
    target.pos = { x: 905, y: 305 };
    updateTeamVisions(world);
    runTeamAi(world, 1, difficultyTier(world, 'regular'));
    expect(defender.targetId).toBeNull();
    expect(defender.ai.destination).toEqual({ x: zone.x, y: zone.y });
  });

  it('does not use an unseen target’s position or health to choose its duty', () => {
    const first = field('intercept');
    const second = field('intercept');
    for (const { world, target } of [first, second]) visionFor(world, 1)!.visible.delete(target.id);
    second.target.pos = { x: 515, y: 305 };
    second.target.locations.centre_torso.internal = 1;
    runTeamAi(first.world, 1, difficultyTier(first.world, 'regular'));
    runTeamAi(second.world, 1, difficultyTier(second.world, 'regular'));
    expect(first.defender.targetId).toBeNull();
    expect(second.defender.targetId).toBeNull();
    expect(second.defender.ai).toEqual(first.defender.ai);
    expect(second.defender.path).toEqual(first.defender.path);
  });

  it('brings an interceptor spawned outside its patrol area back to the zone', () => {
    const { world, defender, zone } = field('intercept');
    defender.pos = { x: 105, y: 305 };
    updateTeamVisions(world);
    runTeamAi(world, 1, difficultyTier(world, 'regular'));
    expect(defender.ai.destination).toEqual({ x: zone.x, y: zone.y });
    expect(defender.path.length).toBeGreaterThan(0);
  });

  it('produces identical directed combat from the same seed', () => {
    const first = field('intercept');
    const second = field('intercept');
    for (let tick = 0; tick < 120; tick += 1) {
      stepWorld(first.world, 2000); stepWorld(second.world, 2000);
    }
    expect(second.world.events).toEqual(first.world.events);
    expect(second.world.entities).toEqual(first.world.entities);
  });
});

describe('mission duty schema', () => {
  it('accepts omitted duties and optional low or legacy player limits', () => {
    const mission = { ...catalog.missions.get('skirmish_ridge')! };
    expect(MissionSchema.parse({ ...mission, enemyDirectives: undefined }).enemyDirectives).toEqual([]);
    expect(MissionSchema.parse({ ...mission, maxPlayerUnits: 1 }).maxPlayerUnits).toBe(1);
    expect(MissionSchema.parse({ ...mission, maxPlayerUnits: 12 }).maxPlayerUnits).toBe(12);
    expect(MissionSchema.safeParse({ ...mission, maxPlayerUnits: 0 }).success).toBe(false);
    expect(MissionSchema.safeParse({ ...mission, maxPlayerUnits: 13 }).success).toBe(false);
  });

  it.each([
    { zoneId: 'missing' }, { team: 7 }, { pursuitRadius: 20 }, { units: 0 },
  ])('rejects invalid duty references or geometry: %j', (change) => {
    const { world } = field();
    const mission = { ...world.mission, enemyDirectives: [{ ...world.mission.enemyDirectives[0], ...change }] };
    expect(MissionSchema.safeParse(mission).success).toBe(false);
  });

  it('rejects duplicate duty IDs', () => {
    const { world } = field();
    expect(MissionSchema.safeParse({ ...world.mission,
      enemyDirectives: [world.mission.enemyDirectives[0], world.mission.enemyDirectives[0]],
    }).success).toBe(false);
  });
});
