import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import type { Mission } from '../schema/mission';
import type { BattleResult } from '../sim/world';
import {
  acceptContract,
  availableNodes,
  campaignNodes,
  resolveMission,
  startCampaign,
} from './campaign';
import { deserialiseCampaign, serialiseCampaign } from './save';

const campaign = (() => {
  const data = catalog.campaigns.get('border_dispute');
  if (data === undefined) throw new Error('missing Great Recall campaign');
  return data;
})();

function node(id: string) {
  const match = campaign.nodes.find((entry) => entry.id === id);
  if (match === undefined) throw new Error(`missing campaign node "${id}"`);
  return match;
}

function mission(id: string): Mission {
  const match = catalog.missions.get(id);
  if (match === undefined) throw new Error(`missing mission "${id}"`);
  return match;
}

function hostileDesignIds(data: Mission): string[] {
  const initial = data.lances
    .filter((lance) => lance.team !== 0)
    .flatMap((lance) => lance.units.map((unit) => unit.designId));
  const delayed = data.triggers.flatMap((trigger) =>
    trigger.effects.flatMap((effect) =>
      effect.type === 'spawn' && effect.team !== 0
        ? effect.units.map((unit) => unit.designId)
        : [],
    ),
  );
  return [...initial, ...delayed];
}

function hostilePilotIds(data: Mission): string[] {
  const initial = data.lances
    .filter((lance) => lance.team !== 0)
    .flatMap((lance) => lance.units.map((unit) => unit.pilotId));
  const delayed = data.triggers.flatMap((trigger) =>
    trigger.effects.flatMap((effect) =>
      effect.type === 'spawn' && effect.team !== 0
        ? effect.units.map((unit) => unit.pilotId)
        : [],
    ),
  );
  return [...initial, ...delayed];
}

function factionOf(designId: string): string | undefined {
  const design = catalog.designs.get(designId);
  return catalog.chassis.get(design?.chassisId ?? '')?.faction;
}

function missionCopy(data: Mission): string {
  const messages = data.triggers.flatMap((trigger) =>
    trigger.effects.flatMap((effect) => (effect.type === 'message' ? [effect.text] : [])),
  );
  return [data.briefing, ...messages].join(' ').toLocaleLowerCase('en-GB');
}

describe('faction campaign story', () => {
  it('starts with four Linewrought mechs and keeps day-zero opposition Linewrought', () => {
    expect(campaign.startingDesignIds).toHaveLength(4);
    expect(campaign.startingDesignIds.every((designId) => factionOf(designId) === 'linewrought'))
      .toBe(true);
    expect(campaign.startingDesignIds.every((designId) => {
      const design = catalog.designs.get(designId);
      return design !== undefined && catalog.chassis.get(design.chassisId)?.frame === 'mech';
    })).toBe(true);
    const dayZeroMissionIds = new Set([
      node('militia_raid').missionId,
      node('supply_line').missionId,
      node('causeway_push').missionId,
      ...campaign.sideWork.missionIds,
    ]);
    for (const missionId of dayZeroMissionIds) {
      const designs = hostileDesignIds(mission(missionId));
      expect(designs.length, `${missionId} has no opposition`).toBeGreaterThan(0);
      expect(
        designs.every((designId) => factionOf(designId) === 'linewrought'),
        `${missionId} reveals Aurelian Stock before Cold Contact`,
      ).toBe(true);
    }

    expect(catalog.lore.get('the_welded')?.body.join(' ')).toContain(
      'No town makes one and no yard stocks a replacement.',
    );
  });

  it('does not offer a named hostile for hire', () => {
    const missionIds = [
      ...campaign.nodes.map((entry) => entry.missionId),
      ...campaign.sideWork.missionIds,
    ];
    const hostilePilots = new Set(missionIds.flatMap((missionId) => hostilePilotIds(mission(missionId))));
    expect(hostilePilots.size).toBeGreaterThan(0);
    expect(campaign.startingPilotIds.some((pilotId) => hostilePilots.has(pilotId))).toBe(false);
    expect(campaign.hiringPoolPilotIds.some((pilotId) => hostilePilots.has(pilotId))).toBe(false);
  });

  it('keeps every hostile machine tied to a valid faction design', () => {
    const missionIds = new Set([
      ...campaign.nodes.map((entry) => entry.missionId),
      ...campaign.sideWork.missionIds,
    ]);

    for (const missionId of missionIds) {
      for (const designId of hostileDesignIds(mission(missionId))) {
        const design = catalog.designs.get(designId);
        expect(design, `${missionId} names missing design ${designId}`).toBeDefined();
        expect(['linewrought', 'aurelian']).toContain(factionOf(designId));
      }
    }
  });

  it('authors rescue and workshop defence into the required spine', () => {
    const spine = [
      ['militia_raid', 'line_maintenance'],
      ['recovery_window', 'recovery_window'],
      ['workshop_defence', 'workshop_defence'],
      ['pass_skirmish', 'sealed_contact'],
      ['foundry_sweep_node', 'rules_break'],
      ['shale_overwatch_node', 'conduit_breach'],
      ['ridge_hold', 'depot_road'],
    ] as const;

    expect(spine.map(([nodeId]) => nodeId)).toEqual([
      'militia_raid',
      'recovery_window',
      'workshop_defence',
      'pass_skirmish',
      'foundry_sweep_node',
      'shale_overwatch_node',
      'ridge_hold',
    ]);
    spine.forEach(([nodeId, missionId], index) => {
      expect(node(nodeId).missionId).toBe(missionId);
      expect(node(nodeId).requires).toEqual(index === 0 ? [] : [spine[index - 1]?.[0]]);
    });

    const contact = node('pass_skirmish');
    expect(contact.maxSalvageShare).toBe(1);
    expect(hostileDesignIds(mission(contact.missionId))).toContain('votive_picket');
    expect(missionCopy(mission('rules_break'))).toContain('live ejection');
    expect(missionCopy(mission('conduit_breach'))).toContain('east breaker');
    expect(missionCopy(mission('conduit_breach'))).toContain('cold yards');
  });

  it('grounds Ironmuster in finite serialized walker roots', () => {
    const recall = catalog.lore.get('the_line');
    const winter = catalog.lore.get('the_foundry_winter');
    const refit = catalog.lore.get('the_refit');
    const code = catalog.lore.get('the_code');
    const copy = [
      recall?.title,
      ...(recall?.body ?? []),
      winter?.title,
      ...(winter?.body ?? []),
      ...(refit?.body ?? []),
      code?.title,
      ...(code?.body ?? []),
    ].join(' ');

    expect(campaign.name).toBe('The Great Recall');
    expect(copy).toContain('Aurelian Compact');
    expect(copy).toContain('Aurelian Continuance');
    expect(copy).toContain('Recall Authority');
    expect(copy).toContain('Foundry Winter');
    expect(copy).toContain('root collar exported as scrap');
    expect(copy).toContain('archive audit recovered');
    expect(copy).toContain('transit took years');
    expect(copy).toContain('reserve and civil-defence walkers');
    expect(copy).toContain('serialized root');
    expect(copy).toContain('Crews give it a name');
    expect(copy).toContain('Ironmuster Code');
    expect(copy).toContain('cannot simply build another');
    expect(copy).toContain('if its cradle survives the breach');
  });

  it('limits service logic to attestation rather than remote control', () => {
    const recall = catalog.lore.get('the_line')?.body.join(' ') ?? '';
    const sealed = catalog.lore.get('the_sealed')?.body.join(' ') ?? '';
    expect(recall).toContain('It cannot start the reactor, steer the legs, move a gun');
    expect(sealed).toContain('cannot start a reactor, turn a hip, move a gun or locate a walker');
  });

  it('keeps walker-root manufacture lost while local vehicles remain constructible', () => {
    const winter = catalog.lore.get('the_foundry_winter')?.body.join(' ') ?? '';
    const colossus = catalog.chassis.get('colossus_cls1');
    const cairn = catalog.chassis.get('cairn_crn3');
    const courser = catalog.chassis.get('courser_crs1');
    const drover = catalog.chassis.get('drover_dvr2');

    expect(winter).toContain('no complete line that can make another root');
    expect(winter).toContain('make a tracked carrier by the hundred');
    expect(colossus?.lore).toContain('eleven matched CLS roots');
    expect(cairn?.lore).toContain('recovered CRN root');
    expect(courser).toMatchObject({ frame: 'vehicle' });
    expect(courser?.lore).toContain('builds the CRS-1');
    expect(drover).toMatchObject({ frame: 'vehicle' });
    expect(drover?.lore).toContain('builds the DVR-2 by the hundred');
  });

  it('offers equally funded, mechanically distinct terminal depot dispositions', () => {
    const burn = node('depot_burn');
    const take = node('depot_take');
    expect(burn.requires).toEqual(['ridge_hold']);
    expect(take.requires).toEqual(['ridge_hold']);
    expect(burn.employerId).toBe('halloran_freight');
    expect(take.employerId).toBe('halloran_freight');
    expect(campaign.victoryNodeId).toBe(burn.id);
    expect(campaign.alternateVictoryNodeIds).toContain(take.id);

    const burnMission = mission(burn.missionId);
    const takeMission = mission(take.missionId);
    expect(hostileDesignIds(burnMission)).not.toEqual(hostileDesignIds(takeMission));
    expect(burnMission.dropTonnage).toBe(takeMission.dropTonnage);
    expect(burnMission.maxDurationSeconds).toBe(takeMission.maxDurationSeconds);
    expect(burnMission.objectives.map((objective) => objective.id)).toContain('arm_purge_train');
    expect(takeMission.objectives.map((objective) => objective.id)).toContain('secure_loading_access');
  });

  it.each(['depot_burn', 'depot_take'])(
    'finishes through the %s ending and closes its sibling',
    (nodeId) => {
      const state = startCampaign(catalog, campaign.id, 'ending-choice');
      state.completedNodes.push(
        'militia_raid',
        'pass_skirmish',
        'foundry_sweep_node',
        'shale_overwatch_node',
        'ridge_hold',
      );
      expect(campaignNodes(catalog, state).map((entry) => entry.id)).toEqual(
        expect.arrayContaining(['depot_burn', 'depot_take']),
      );
      expect(acceptContract(catalog, state, nodeId, 'fee_first').ok).toBe(true);
      const missionId = state.contract?.missionId;
      if (missionId === undefined) throw new Error('ending contract was not signed');

      const battle: BattleResult = {
        seed: 'ending-choice',
        missionId,
        missionStatus: 'success',
        missionReason: 'objectives-complete',
        objectives: [],
        ticks: 1,
        durationSeconds: 0.05,
        winner: 0,
        decided: true,
        units: [],
        weapons: [],
      };
      resolveMission(catalog, state, battle, []);

      expect(state).toMatchObject({ finished: true, won: true });
      expect(state.completedNodes).toContain(nodeId);
      expect(availableNodes(catalog, state)).toEqual([]);

      const restored = deserialiseCampaign(serialiseCampaign(state), catalog).state;
      expect(restored).toMatchObject({ finished: true, won: true });
      expect(restored?.completedNodes).toContain(nodeId);
    },
  );

  it('keeps the Aurelian article behind the first-contact completion', () => {
    const welded = catalog.lore.get('the_welded');
    const sealed = catalog.lore.get('the_sealed');
    const winter = catalog.lore.get('the_foundry_winter');
    expect(welded?.unlockNodeId).toBeUndefined();
    expect(welded?.body.join(' ')).toContain('Linewrought');
    expect(winter?.unlockNodeId).toBeUndefined();
    expect(sealed?.unlockNodeId).toBe('pass_skirmish');
    expect(sealed?.body.join(' ')).toContain('Aurelian Stock');
  });
});
