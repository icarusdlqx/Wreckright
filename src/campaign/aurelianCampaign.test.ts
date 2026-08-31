import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import type { Mission } from '../schema/mission';
import { availableNodes, startCampaign } from './campaign';
import { deserialiseCampaign, serialiseCampaign } from './save';

const campaign = (() => {
  const entry = catalog.campaigns.get('aurelian_recall');
  if (entry === undefined) throw new Error('missing Aurelian campaign');
  return entry;
})();

function factionOf(designId: string): string | undefined {
  const design = catalog.designs.get(designId);
  return catalog.chassis.get(design?.chassisId ?? '')?.faction;
}

function mission(id: string): Mission {
  const entry = catalog.missions.get(id);
  if (entry === undefined) throw new Error(`missing mission ${id}`);
  return entry;
}

function hostileDesigns(entry: Mission): string[] {
  const initial = entry.lances
    .filter((lance) => lance.team !== 0)
    .flatMap((lance) => lance.units.map((unit) => unit.designId));
  const reinforcements = entry.triggers.flatMap((trigger) => trigger.effects.flatMap((effect) =>
    effect.type === 'spawn' && effect.team !== 0
      ? effect.units.map((unit) => unit.designId)
      : [],
  ));
  return [...initial, ...reinforcements];
}

function hostilePilotIds(entry: Mission): string[] {
  const initial = entry.lances
    .filter((lance) => lance.team !== 0)
    .flatMap((lance) => lance.units.map((unit) => unit.pilotId));
  const reinforcements = entry.triggers.flatMap((trigger) => trigger.effects.flatMap((effect) =>
    effect.type === 'spawn' && effect.team !== 0
      ? effect.units.map((unit) => unit.pilotId)
      : [],
  ));
  return [...initial, ...reinforcements];
}

function mechanicalMission(entry: Mission): object {
  return {
    type: entry.type,
    mapId: entry.mapId,
    atmosphereId: entry.atmosphereId,
    maxDurationSeconds: entry.maxDurationSeconds,
    startingResourcePoints: entry.startingResourcePoints,
    dropTonnage: entry.dropTonnage,
    lances: entry.lances.map((lance) => ({ team: lance.team, units: lance.units })),
    reserves: entry.reserves,
    zones: entry.zones.map((zone) => ({
      id: zone.id,
      x: zone.x,
      y: zone.y,
      radius: zone.radius,
      owner: zone.owner,
      captureSeconds: zone.captureSeconds,
      resourcePoints: zone.resourcePoints,
    })),
    objectives: entry.objectives.map((objective) => ({
      id: objective.id,
      type: objective.type,
      team: objective.team,
      required: objective.required,
      zoneIds: objective.zoneIds,
      holdSeconds: objective.holdSeconds,
      resourcePoints: objective.resourcePoints,
    })),
    triggers: entry.triggers.map((trigger) => ({
      id: trigger.id,
      when: trigger.when,
      once: trigger.once,
      effects: trigger.effects.map((effect) =>
        effect.type === 'message' ? { type: effect.type } : effect,
      ),
    })),
  };
}

describe('Aurelian Recall campaign', () => {
  it('authors a winnable nine-contract arc with two disposition endings', () => {
    expect(campaign.nodes.map((node) => [node.id, node.missionId, node.requires])).toEqual([
      ['first_warrant', 'raid_ridge', []],
      ['cutbank_attestation', 'base_capture_ridge', ['first_warrant']],
      ['sarn_inventory', 'switchyard_watch', ['cutbank_attestation']],
      ['root_exchange', 'authority_root_exchange', ['sarn_inventory']],
      ['quarry_receipt', 'authority_quarry_receipt', ['root_exchange']],
      ['conduit_injunction', 'authority_conduit_injunction', ['quarry_receipt']],
      ['barrow_warrant', 'authority_barrow_warrant', ['conduit_injunction']],
      ['continuance_export', 'authority_continuance_export', ['barrow_warrant']],
      ['local_stewardship', 'authority_local_stewardship', ['barrow_warrant']],
    ]);
    expect(campaign.victoryNodeId).toBe('continuance_export');
    expect(campaign.alternateVictoryNodeIds).toEqual(['local_stewardship']);
    expect(campaign.sideWork).toEqual({ missionIds: [], employerIds: [] });
    expect(campaign.nodes.every((node) => node.maxSalvageShare === 0.1)).toBe(true);

    const originalMissions = campaign.nodes.slice(3).map((node) => mission(node.missionId));
    expect(originalMissions.map((entry) => entry.id)).toEqual([
      'authority_root_exchange',
      'authority_quarry_receipt',
      'authority_conduit_injunction',
      'authority_barrow_warrant',
      'authority_continuance_export',
      'authority_local_stewardship',
    ]);
    expect(new Set(originalMissions.map((entry) => entry.name))).toHaveLength(6);
    for (const entry of originalMissions) {
      const playerDesigns = entry.lances
        .filter((lance) => lance.team === 0)
        .flatMap((lance) => lance.units.map((unit) => unit.designId));
      expect(playerDesigns.length, `${entry.id} has no authored Custodian lance`).toBeGreaterThan(0);
      expect(playerDesigns.every((id) => factionOf(id) === 'aurelian')).toBe(true);
      expect(entry.objectives.filter((objective) => objective.required).length).toBeGreaterThan(1);
    }
    expect(originalMissions.map((entry) => entry.briefing).join(' '))
      .toMatch(/exchange.*Blackglass.*conduit.*warrant.*export.*stewardship/is);
  });

  it('offers mechanically equal final dispositions as leaves of the same warrant', () => {
    const exportNode = campaign.nodes.find((node) => node.id === 'continuance_export');
    const stewardshipNode = campaign.nodes.find((node) => node.id === 'local_stewardship');
    expect(exportNode).toMatchObject({
      employerId: 'continuance_tender',
      requires: ['barrow_warrant'],
      basePayout: 2_100_000,
      maxSalvageShare: 0.1,
      deadlineDays: 46,
    });
    expect(stewardshipNode).toMatchObject({
      employerId: 'continuance_tender',
      requires: ['barrow_warrant'],
      basePayout: 2_100_000,
      maxSalvageShare: 0.1,
      deadlineDays: 46,
    });
    expect(campaign.nodes.some((node) => node.requires.includes('continuance_export'))).toBe(false);
    expect(campaign.nodes.some((node) => node.requires.includes('local_stewardship'))).toBe(false);

    const exportMission = mission('authority_continuance_export');
    const stewardshipMission = mission('authority_local_stewardship');
    expect(mechanicalMission(exportMission)).toEqual(mechanicalMission(stewardshipMission));
  });

  it('fields a full sealed company against only Linewrought opposition', () => {
    expect(campaign.startingDesignIds).toEqual([
      'votive_picket',
      'sentinel_brawler',
      'falchion_duellist',
      'halberd_prime',
    ]);
    expect(campaign.startingDesignIds.every((id) => factionOf(id) === 'aurelian')).toBe(true);
    expect(campaign.startingDesignIds.every((id) => {
      const design = catalog.designs.get(id);
      return design !== undefined && catalog.chassis.get(design.chassisId)?.frame === 'mech';
    })).toBe(true);

    const missions = campaign.nodes.map((node) => mission(node.missionId));
    for (const entry of missions) {
      const hostiles = hostileDesigns(entry);
      expect(hostiles.length, `${entry.id} has no opposition`).toBeGreaterThan(0);
      expect(hostiles.every((id) => factionOf(id) === 'linewrought')).toBe(true);
    }
    const usedPilots = new Set(missions.flatMap(hostilePilotIds));
    expect([...campaign.startingPilotIds, ...campaign.hiringPoolPilotIds]
      .every((pilotId) => !usedPilots.has(pilotId))).toBe(true);
  });

  it('inverts the first campaign economy without changing campaign machinery', () => {
    const linewrought = catalog.campaigns.get('border_dispute');
    expect(campaign.startingCbills).toBe(1_600_000);
    expect(campaign.startingCbills).toBe((linewrought?.startingCbills ?? 0) / 2);
    expect(catalog.rules.economy.repair.factionFactors.aurelian).toEqual({
      cost: 2.5,
      days: 2.5,
    });
    expect(catalog.rules.economy.market.availableFactions).not.toContain('aurelian');
  });

  it('reopens a completed Stage 1 save at the first added contract', () => {
    const state = startCampaign(catalog, campaign.id, 'aurelian-stage-one-save');
    state.completedNodes.push('first_warrant', 'cutbank_attestation', 'sarn_inventory');
    state.finished = true;
    state.won = true;

    const restored = deserialiseCampaign(serialiseCampaign(state), catalog).state;
    expect(restored).toMatchObject({ finished: false, won: false });
    if (restored === null) throw new Error('expanded campaign save did not load');
    expect(availableNodes(catalog, restored).map((node) => node.id)).toEqual(['root_exchange']);
    expect(restored.log[0]?.text).toContain('new contracts reopen this completed run');
  });

  it('reopens a completed Stage 2 save at both final dispositions', () => {
    const state = startCampaign(catalog, campaign.id, 'aurelian-stage-two-save');
    state.completedNodes.push(
      'first_warrant',
      'cutbank_attestation',
      'sarn_inventory',
      'root_exchange',
      'quarry_receipt',
      'conduit_injunction',
      'barrow_warrant',
    );
    state.finished = true;
    state.won = true;

    const restored = deserialiseCampaign(serialiseCampaign(state), catalog).state;
    expect(restored).toMatchObject({ finished: false, won: false });
    if (restored === null) throw new Error('expanded campaign save did not load');
    expect(availableNodes(catalog, restored).map((node) => node.id)).toEqual([
      'continuance_export',
      'local_stewardship',
    ]);
    expect(restored.log[0]?.text).toContain('new contracts reopen this completed run');
  });

  it('frames custody as civil attestation rather than remote control', () => {
    const briefs = campaign.nodes.map((node) => node.brief);
    expect(new Set(briefs)).toHaveLength(9);
    expect(briefs.join(' ')).toMatch(/Recall Authority.*Linewrought.*custody/is);
    expect(campaign.nodes.map((node) => mission(node.missionId).briefing).join(' '))
      .not.toMatch(/Halloran|Kestrel/);
    expect(catalog.lore.get('the_custodians')).toMatchObject({
      order: 7,
      unlockNodeId: 'first_warrant',
    });
    expect(catalog.lore.get('the_custodians')?.body.join(' ')).toContain(
      'It cannot start a reactor, steer a leg or move a gun.',
    );
    expect(catalog.lore.get('the_borrowed_roots')).toMatchObject({
      order: 8,
      unlockNodeId: 'root_exchange',
    });
    expect(catalog.lore.get('the_borrowed_roots')?.body.join(' '))
      .toMatch(/Foundry Winter.*not a command channel.*Recall Authority/is);
    expect(catalog.lore.get('the_two_readings')).toMatchObject({
      order: 9,
      unlockNodeId: 'barrow_warrant',
    });
    expect(catalog.lore.get('the_two_readings')?.summary).toMatch(/two lawful dispositions/i);
    expect(catalog.lore.get('the_two_readings')?.body.join(' '))
      .toMatch(/local stewardship.*Both readings.*Continuance.*cannot choose.*cannot start a reactor/is);
  });
});
