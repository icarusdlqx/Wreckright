import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { computeLoadout } from '../sim/loadout';
import { issueMove, setHoldFire, setPosture } from '../sim/orders';
import { isOperational, type World } from '../sim/types';
import { createWorld, stepWorld } from '../sim/world';
import { applyEffect } from '../sim/triggers';
import { TriggerEffectSchema } from './mission';
import { checkIntegrity } from './integrity';
import type { ContentIssue } from './load';

const NEW_MISSIONS = [
  ['marker_survey', 45, 1], ['recovery_window', 140, 3], ['workshop_defence', 205, 5],
  ['custody_survey', 50, 1], ['custody_resupply', 135, 3],
] as const;

function advance(world: World, until: () => boolean): void {
  const limit = Math.ceil(world.mission.maxDurationSeconds / world.dt);
  while (!world.finished && world.tick < limit && !until()) stepWorld(world, limit);
}

describe('campaign command refinements', () => {
  it.each(NEW_MISSIONS)('authors %s with an affordable legal stock detail', (id, tonnage, slots) => {
    const mission = catalog.missions.get(id)!;
    expect(mission).toMatchObject({ dropTonnage: tonnage, maxPlayerUnits: slots });
    const player = mission.lances.find((lance) => lance.team === 0)!;
    expect(player.units.length).toBeLessThanOrEqual(slots);
    let weight = 0;
    for (const unit of player.units) {
      const design = catalog.designs.get(unit.designId)!;
      expect(computeLoadout(catalog, design).valid, unit.designId).toBe(true);
      weight += catalog.chassis.get(design.chassisId)!.tonnage;
    }
    expect(weight).toBeLessThanOrEqual(tonnage);
    expect(mission.objectives.some((objective) => objective.type === 'destroy_all')).toBe(false);
    expect(mission.enemyDirectives.length).toBeGreaterThan(0);
  });

  it.each([
    ['marker_survey', 'west_marker', 'upper_reader'],
    ['custody_survey', 'west_service_post', 'upper_service_post'],
  ])('wins %s with its stock scout, real movement and no shots or kills', (id, first, second) => {
    const world = createWorld(catalog, { seed: 'quiet-survey', missionId: id!, playerTeam: 0 });
    const scout = world.entities.find((entity) => entity.team === 0)!;
    setHoldFire(scout, true);
    for (const zoneId of [first, second]) {
      const zone = world.zones.find((entry) => entry.id === zoneId)!;
      expect(issueMove(world, scout, zone, true), zoneId).toBe(true);
      advance(world, () => zone.owner === 0);
      expect(zone.owner, zoneId).toBe(0);
    }
    advance(world, () => world.finished);
    expect(world.missionStatus).toBe('success');
    expect(world.entities.every(isOperational)).toBe(true);
    expect(world.events.filter((event) => event.type === 'weapon_fired' &&
      event.shooterId === scout.id)).toEqual([]);
  });

  it.each(['recovery_window', 'custody_resupply'])('%s closes on time with surviving claimants', (id) => {
    const world = createWorld(catalog, { seed: 'recovery-ground', missionId: id, playerTeam: 0 });
    for (const unit of world.entities.filter((entity) => entity.team === 0)) {
      setPosture(unit, 'hold_position');
      setHoldFire(unit, true);
    }
    advance(world, () => world.finished);
    expect(world.missionStatus).toBe('success');
    expect(world.tick * world.dt).toBe(120);
    expect(world.entities.some((entity) => entity.team === 1 && isOperational(entity))).toBe(true);
  });

  it('defends the workshop while one stock scout retrieves the optional stores', () => {
    const world = createWorld(catalog, { seed: 'gantry-defence', missionId: 'workshop_defence', playerTeam: 0 });
    const scout = world.entities.find((entity) => entity.team === 0)!;
    for (const unit of world.entities.filter((entity) => entity.team === 0 && entity !== scout)) {
      setPosture(unit, 'hold_position');
    }
    const stores = world.zones.find((zone) => zone.id === 'stores_cabinet')!;
    expect(issueMove(world, scout, stores, true)).toBe(true);
    advance(world, () => stores.owner === 0);
    expect(stores.owner).toBe(0);
    expect(issueMove(world, scout, { x: 444, y: 492 }, true)).toBe(true);
    advance(world, () => world.finished);
    expect(world.missionStatus).toBe('success');
    expect(world.objectives.find((objective) => objective.id === 'recover_workshop_stock')?.status).toBe('complete');
    expect(world.triggers.filter((trigger) => trigger.definition.effects.some((effect) => effect.type === 'spawn'))
      .every((trigger) => trigger.fired === 1)).toBe(true);
  });

  it('keeps the old campaign spine open and suggests survey then recovery after First Notice', () => {
    const campaign = catalog.campaigns.get('border_dispute')!;
    expect(campaign.nodes.slice(0, 4).map((node) => node.id)).toEqual([
      'militia_raid', 'marker_survey', 'recovery_window', 'workshop_defence',
    ]);
    const oldSpine = [
      ['militia_raid', []], ['pass_skirmish', ['militia_raid']],
      ['foundry_sweep_node', ['pass_skirmish']], ['shale_overwatch_node', ['foundry_sweep_node']],
      ['ridge_hold', ['shale_overwatch_node']], ['depot_burn', ['ridge_hold']], ['depot_take', ['ridge_hold']],
    ] as const;
    for (const [id, requires] of oldSpine) {
      expect(campaign.nodes.find((node) => node.id === id)?.requires).toEqual(requires);
    }
    expect(catalog.missions.get('line_maintenance')?.enemyDirectives).toEqual([]);
    for (const id of ['mirror_ridge', 'training_ground', 'salvage_tactics']) {
      expect(catalog.missions.get(id)?.enemyDirectives, id).toEqual([]);
    }
    expect(catalog.missions.get('mirror_ridge')?.startingResourcePoints).toBe(0);
  });

  it('preserves optional authored radio speakers without changing legacy message events', () => {
    const world = createWorld(catalog, { seed: 'public-radio', missionId: 'marker_survey', playerTeam: 0 });
    const spoken = TriggerEffectSchema.parse({
      type: 'message', text: 'Reader copied.', speakerPilotId: 'kessa_vale',
    });
    applyEffect(world, spoken);
    expect(world.events.at(-1)).toEqual({
      type: 'mission_message', tick: 0, text: 'Reader copied.', speakerPilotId: 'kessa_vale',
    });
    applyEffect(world, { type: 'message', text: 'Command channel.' });
    expect(world.events.at(-1)).toEqual({ type: 'mission_message', tick: 0, text: 'Command channel.' });
  });

  it('rejects a radio portrait that is not an authored pilot', () => {
    const mission = structuredClone(catalog.missions.get('marker_survey')!);
    mission.triggers[0]!.effects = [{ type: 'message', text: 'Unknown speaker.', speakerPilotId: 'missing_pilot' }];
    const issues: ContentIssue[] = [];
    checkIntegrity({ ...catalog, missions: new Map(catalog.missions).set(mission.id, mission) }, issues);
    expect(issues).toContainEqual({
      file: 'missions/marker_survey.json', path: 'triggers.0.effects.0.speakerPilotId',
      message: 'unknown pilot "missing_pilot"',
    });
  });
});
