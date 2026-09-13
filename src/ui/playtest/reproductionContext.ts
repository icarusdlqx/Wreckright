import { loadCampaign } from '../../campaign/save';
import type { CampaignState } from '../../campaign/types';
import { getCatalog } from '../../schema/load';
import { useGame } from '../store';
import type { ReproductionContext } from './schema';

function savedCampaign(): CampaignState | null {
  try {
    return loadCampaign(getCatalog()).state;
  } catch {
    return null;
  }
}

function campaignLance(state: CampaignState): ReproductionContext['lance'] {
  const selected = state.deploymentSelection ?? state.mechs.map((mech) => mech.id);
  return selected.slice(0, 5).flatMap((mechId) => {
    const mech = state.mechs.find((entry) => entry.id === mechId);
    if (mech === undefined) return [];
    const pilot = state.pilots.find((entry) => entry.mechId === mech.id);
    return [{
      mech: mech.design.name,
      pilot: pilot?.name ?? 'Unassigned',
      loadout: mech.design.mounts.map((mount) => `${mount.location}: ${mount.weaponId}`),
    }];
  });
}

/** Captures only bounded gameplay facts needed to reproduce a written report. */
export function captureReproductionContext(): ReproductionContext {
  const game = useGame.getState();
  const campaign = savedCampaign();
  const battleLance = game.units.slice(0, 5).map((unit) => ({
    mech: unit.identity,
    pilot: unit.pilotName,
    loadout: unit.weapons.map((weapon) =>
      `${weapon.location}: ${weapon.name}${weapon.rounds === null ? '' : ` (${weapon.rounds} rounds)`}`),
  }));
  const campaignMode = campaign !== null &&
    (game.screen === 'campaign' || game.campaignPending || game.screen === 'mechbay');
  const campaignTitle = campaign === null
    ? ''
    : getCatalog().campaigns.get(campaign.campaignId)?.presentation?.title ?? campaign.campaignId;
  return {
    build: __IRONMUSTER_VERSION__,
    mode: game.screen,
    mission: game.missionName || (campaign?.contract?.missionId ?? game.skirmishMissionId),
    faction: campaignMode ? campaignTitle : 'Skirmish force',
    difficulty: campaignMode ? campaign?.difficulty ?? game.difficulty : game.difficulty,
    day: campaignMode ? campaign?.day ?? null : null,
    companyFunds: campaignMode ? campaign?.cbills ?? null : null,
    lance: battleLance.length > 0
      ? battleLance
      : campaign === null ? [] : campaignLance(campaign),
  };
}
