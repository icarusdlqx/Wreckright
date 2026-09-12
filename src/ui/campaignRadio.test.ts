import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { acceptContract, availableNodes, prepareDeployment, resolveMission, startCampaign } from '../campaign/campaign';
import { rewardBattle } from '../campaign/missionRewardFixtures';
import { clearSavedCampaign, loadCampaign, saveCampaign } from '../campaign/save';
import { createWorld } from '../sim/world';
import { FIELD_RADIO } from '../schema/fieldRadio';
import { PILOT_CONTINUITY } from '../schema/pilotContinuity';
import { beginFieldRadio, dismissRadio, pilotOrder, readRadioMessage } from './fieldRadio';
import { campaignRadioFor, persistCampaignMemory } from './campaignRadio';

function returnedCompany() {
  const state = startCampaign(catalog, 'border_dispute', 'memory-integration');
  acceptContract(catalog, state, availableNodes(catalog, state)[0]!.id, 'standard');
  const contract = { ...state.contract! };
  const deployment = prepareDeployment(catalog, state);
  resolveMission(catalog, state, rewardBattle(deployment.missionId, deployment.lance), deployment.lance, false);
  state.history.at(-1)!.pilotReports[0]!.fate = 'injured';
  state.contract = contract;
  const world = createWorld(catalog, { missionId: deployment.missionId, seed: deployment.seed,
    playerTeam: deployment.playerTeam, playerLance: deployment.entries });
  return { state, deployment, world };
}

describe('campaign radio persistence bridge', () => {
  const real = globalThis.localStorage;
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    } });
    clearSavedCampaign({ recover: true });
  });
  afterEach(() => Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: real }));

  it('persists only an actually spoken memory and does not repeat it after reload', () => {
    const { state, deployment, world } = returnedCompany();
    saveCampaign(state);
    beginFieldRadio(world);
    campaignRadioFor(catalog, state, deployment)(world);
    expect(loadCampaign(catalog).state!.pilots[0]!.radioMemories).toBeUndefined();
    const pilot = world.entities.find((entry) => entry.team === world.playerTeam)!;
    pilotOrder(world, pilot, 'move');
    expect(readRadioMessage()?.text).toBe(PILOT_CONTINUITY.pilots.kessa_vale!.return);
    expect(loadCampaign(catalog).state!.pilots[0]!.radioMemories).toHaveLength(1);
    dismissRadio(readRadioMessage()!.id);
    const loaded = loadCampaign(catalog).state!;
    beginFieldRadio(world);
    campaignRadioFor(catalog, loaded, prepareDeployment(catalog, loaded))(world);
    world.tick += Math.ceil(FIELD_RADIO.routineGapSeconds / world.dt);
    pilotOrder(world, pilot, 'move');
    expect(readRadioMessage()?.text).not.toBe(PILOT_CONTINUITY.pilots.kessa_vale!.return);
  });

  it('keeps newer campaign changes and ignores a callback from another company', () => {
    const { state, deployment } = returnedCompany();
    saveCampaign({ ...state, cbills: state.cbills + 500 });
    const pilot = deployment.lance[0]!.pilot;
    const cue = { pilotId: pilot.id, templateId: pilot.templateId, kind: 'return' as const, key: 'return:test' };
    expect(persistCampaignMemory(catalog, state, cue)).toBe(true);
    expect(loadCampaign(catalog).state!.cbills).toBe(state.cbills + 500);
    const replacement = startCampaign(catalog, 'border_dispute', 'other-company');
    saveCampaign(replacement);
    expect(persistCampaignMemory(catalog, state, { ...cue, key: 'return:stale' })).toBe(false);
    expect(loadCampaign(catalog).state!.seed).toBe('other-company');
    expect(loadCampaign(catalog).state!.pilots[0]!.radioMemories).toBeUndefined();
  });

  it('provides a distinct authored response for every registered pilot and each memory event', () => {
    const pilots = [...catalog.pilots.keys()];
    expect(Object.keys(PILOT_CONTINUITY.pilots).sort()).toEqual(pilots.sort());
    for (const kind of ['return', 'refit', 'recovered_weapon', 'revisit'] as const) {
      expect(new Set(pilots.map((id) => PILOT_CONTINUITY.pilots[id]![kind])).size).toBe(pilots.length);
    }
  });
});
