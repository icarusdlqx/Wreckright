import type { Catalog } from '../schema/load';
import { createRng } from '../sim/rng';
import { pristineCondition } from './repair';
import { emptyHistoryArchive } from './history';
import { logCampaign } from './campaignState';
import type { CampaignState, MechRecord } from './types';

export function startCampaign(
  catalog: Catalog, campaignId: string, seed: string,
  difficulty = catalog.rules.difficulty.default,
): CampaignState {
  const campaign = catalog.campaigns.get(campaignId);
  if (campaign === undefined) throw new Error(`unknown campaign "${campaignId}"`);
  if (catalog.rules.difficulty.tiers[difficulty] === undefined) throw new Error('unknown campaign difficulty');

  const state: CampaignState = {
    campaignId,
    difficulty,
    difficultyConfigured: true,
    seed,
    rng: createRng(`${seed}:campaign`).save(),
    day: campaign.startingDay,
    cbills: campaign.startingCbills,
    mechs: [],
    pilots: [],
    benched: [],
    deploymentSelection: null,
    lancePresets: [],
    claimedRewardIds: [],
    sharedXpClaims: [],
    store: [],
    completedNodes: [],
    failedNodes: [],
    sideTaken: [],
    marketBought: [],
    contract: null,
    history: [],
    historyArchive: emptyHistoryArchive(),
    employerFailures: [],
    eventEffects: { supplierDiscountThroughDay: null, freeRepairDays: 0 },
    log: [],
    finished: false,
    won: false,
    nextId: 1,
  };

  campaign.startingDesignIds.forEach((designId, index) => {
    const design = catalog.designs.get(designId);
    if (design === undefined) throw new Error(`unknown design "${designId}"`);

    const mech: MechRecord = {
      id: `mech-${state.nextId}`,
      design: JSON.parse(JSON.stringify(design)) as typeof design,
      condition: pristineCondition(catalog, design),
      status: 'ready',
      readyOnDay: state.day,
      rebuildCost: 0,
    };
    state.nextId += 1;
    state.mechs.push(mech);

    const pilotId = campaign.startingPilotIds[index];
    const template = pilotId === undefined ? undefined : catalog.pilots.get(pilotId);
    if (template === undefined) return;

    state.pilots.push({
      id: `pilot-${state.nextId}`,
      templateId: template.id,
      name: template.name,
      gunnery: template.gunnery,
      piloting: template.piloting,
      sensors: template.sensors,
      xp: 0,
      spentXp: 0,
      traits: [...template.traits],
      bio: template.bio,
      injuredUntilDay: state.day,
      recoveryMissions: 0,
      dead: false,
      mechId: mech.id,
    });
    state.nextId += 1;
  });

  logCampaign(state, `${campaign.name} begins.`);
  return state;
}
