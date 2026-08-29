import { describe, expect, it } from 'vitest';
import { makeGrid, playerWorld, spawnDesign, unitOf } from '../../tests/support';
import { eventsOfType } from './events';
import { issueAttack } from './orders';
import { updateTeamVisions } from './sensors';
import type { MechEntity, World } from './types';
import { stepWorld } from './world';

function park(entity: MechEntity): void {
  entity.autopilot = false;
  entity.controller = 'orders';
  entity.targetId = null;
  entity.calledShot = null;
  entity.orders.attack = null;
  entity.orders.move = null;
  entity.orders.queue.length = 0;
  entity.path.length = 0;
  entity.pathIndex = 0;
  entity.motion = 'stationary';
  entity.intendedMotion = 'stationary';
  entity.posture = 'hold_position';
  entity.ai.destination = null;
  entity.ai.focusTargetId = null;
  entity.ai.withdrawing = false;
  entity.groupEnabled.fill(false);
  entity.groupIntent.fill(false);
}

function tacticWorld(): { world: World; shooter: MechEntity; forward: MechEntity; rear: MechEntity } {
  const world = playerWorld('fire-treeline-tactic');
  world.terrain = makeGrid({
    tileSize: 24,
    tiles: ['........', '........', '...ffff.', '........', '........'],
    legend: { '.': 'open', f: 'forest' },
  });
  world.rules = {
    ...world.rules,
    terrain: {
      ...world.rules.terrain,
      fire: {
        ...world.rules.terrain.fire,
        burnSeconds: 0.2,
        spreadIntervalSeconds: 0.05,
        baseSpreadChance: 1,
        windSpreadChance: 0,
        ignitionChance: {
          ...world.rules.terrain.fire.ignitionChance,
          incendiaryHit: 1,
        },
      },
    },
  };
  world.atmosphere = {
    ...world.atmosphere,
    mechanics: { ...world.atmosphere.mechanics, wind: { x: 0, y: 0 } },
  };

  const shooter = unitOf(world, 'hornet_spotter');
  const rear = unitOf(world, 'wisp_scout');
  const forward = spawnDesign(world, 'sentinel_brawler', 1);
  for (const entity of world.entities) {
    park(entity);
    entity.destroyed = entity !== shooter && entity !== forward && entity !== rear;
  }
  shooter.pos = world.terrain.tileCentre(1, 2);
  shooter.facing = 0;
  forward.pos = world.terrain.tileCentre(3, 2);
  forward.facing = Math.PI;
  rear.pos = world.terrain.tileCentre(6, 2);
  rear.facing = Math.PI;
  const flamer = shooter.weapons.find((mount) => mount.weaponId === 'flamer');
  if (flamer === undefined) throw new Error('tactic fixture has no flamer');
  shooter.groupEnabled[flamer.group - 1] = true;
  shooter.groupIntent[flamer.group - 1] = true;
  for (const vision of world.visions.values()) vision.opticalFootprints.clear();
  world.events.length = 0;
  updateTeamVisions(world);
  return { world, shooter, forward, rear };
}

describe('fire as a player tactic', () => {
  it('opens a spreading treeline only after enough intermediate forest burns out', () => {
    const { world, shooter, forward, rear } = tacticWorld();
    const vision = world.visions.get(shooter.team);
    if (vision === undefined) throw new Error('player vision is unavailable');
    expect(vision.visible.has(forward.id)).toBe(true);
    expect(vision.visible.has(rear.id)).toBe(false);
    expect(issueAttack(world, shooter, forward.id, null)).toBe(true);

    let ignited = false;
    for (let step = 0; step < 120 && !ignited; step += 1) {
      stepWorld(world, 10_000);
      ignited = eventsOfType(world.events, 'terrain_ignited').some((event) => event.cell === 19);
      world.events.length = 0;
    }
    expect(ignited).toBe(true);
    shooter.orders.attack = null;
    shooter.targetId = null;
    shooter.groupEnabled.fill(false);
    shooter.groupIntent.fill(false);

    const burned: number[] = [];
    for (let step = 0; step < 20 && !vision.visible.has(rear.id); step += 1) {
      stepWorld(world, 10_000);
      burned.push(...eventsOfType(world.events, 'terrain_burned').map((event) => event.cell));
      if (burned.length === 1) expect(vision.visible.has(rear.id)).toBe(false);
      world.events.length = 0;
    }

    expect(burned.slice(0, 2)).toEqual([19, 20]);
    expect(world.terrain.idAt(3, 2)).toBe('burnt_forest');
    expect(world.terrain.idAt(4, 2)).toBe('burnt_forest');
    expect(vision.visible.has(rear.id)).toBe(true);
  });
});
