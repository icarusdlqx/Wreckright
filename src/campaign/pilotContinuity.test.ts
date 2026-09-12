import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { acceptContract, availableNodes, prepareDeployment, resolveMission, startCampaign } from './campaign';
import { rewardBattle } from './missionRewardFixtures';
import { campaignPilotMemories, rememberPilotCue, weaponLayoutIdentity } from './pilotContinuity';
import { deserialiseCampaign, serialiseCampaign } from './save';
import type { Deployment } from './deployment';

function fielded() {
  const state = startCampaign(catalog, 'border_dispute', 'pilot-memory');
  acceptContract(catalog, state, availableNodes(catalog, state)[0]!.id, 'standard');
  const contract = { ...state.contract! };
  const deployment = prepareDeployment(catalog, state);
  resolveMission(catalog, state, rewardBattle(deployment.missionId, deployment.lance), deployment.lance, false);
  state.contract = contract;
  return { state, deployment, pair: deployment.lance[0]!, report: state.history.at(-1)!.pilotReports[0]! };
}

function mountNewWeapon(deployment: Deployment): string {
  const mech = deployment.lance[0]!.mech;
  const id = [...catalog.weapons.keys()].find((id) => !mech.design.mounts.some((mount) => mount.weaponId === id))!;
  mech.design.mounts[0] = { weaponId: id, location: 'left_arm' };
  return id;
}

describe('campaign pilot continuity facts', () => {
  it('keeps a fresh company quiet and records its actual deployed weapons in the debrief', () => {
    const state = startCampaign(catalog, 'border_dispute', 'fresh-memories');
    acceptContract(catalog, state, availableNodes(catalog, state)[0]!.id, 'standard');
    const deployment = prepareDeployment(catalog, state);
    expect(campaignPilotMemories(catalog, state, deployment.lance)).toEqual([]);
    resolveMission(catalog, state, rewardBattle(deployment.missionId, deployment.lance), deployment.lance, false);
    expect(state.history.at(-1)!.pilotReports[0]).toMatchObject({
      weaponLayout: weaponLayoutIdentity(deployment.lance[0]!.mech.design),
      weaponIds: [...new Set(deployment.lance[0]!.mech.design.mounts.map((mount) => mount.weaponId))],
    });
  });

  it('only recognises return from injury when the wounded pilot is actually available', () => {
    const { state, deployment, pair, report } = fielded();
    report.fate = 'injured';
    pair.pilot.recoveryMissions = 1;
    expect(campaignPilotMemories(catalog, state, deployment.lance).filter((cue) => cue.kind === 'return')).toEqual([]);
    pair.pilot.recoveryMissions = 0;
    const cue = campaignPilotMemories(catalog, state, deployment.lance).find((cue) => cue.kind === 'return')!;
    expect(cue.pilotId).toBe(pair.pilot.id);
    expect(rememberPilotCue(state, cue)).toBe(true);
    expect(rememberPilotCue(state, cue)).toBe(false);
    const loaded = deserialiseCampaign(serialiseCampaign(state), catalog).state!;
    expect(loaded.pilots[0]!.radioMemories).toContain(cue.key);
    expect(campaignPilotMemories(catalog, loaded, prepareDeployment(catalog, loaded).lance).some((entry) => entry.kind === 'return')).toBe(false);
  });

  it('recognises a changed weapon layout but not a renamed or reordered design', () => {
    const { state, deployment, pair } = fielded();
    pair.mech.design = structuredClone(pair.mech.design);
    pair.mech.design.name = 'New Name';
    pair.mech.design.mounts.reverse();
    expect(campaignPilotMemories(catalog, state, deployment.lance).some((cue) => cue.kind === 'refit')).toBe(false);
    mountNewWeapon(deployment);
    expect(campaignPilotMemories(catalog, state, deployment.lance)).toContainEqual(expect.objectContaining({ kind: 'refit', pilotId: pair.pilot.id }));
  });

  it('requires a new fitted weapon and confirmed claimed salvage before calling it recovered', () => {
    const { state, deployment } = fielded();
    const weaponId = mountNewWeapon(deployment);
    const outcome = state.history.at(-1)!;
    outcome.salvageOffered = [{ kind: 'weapon', itemId: weaponId, count: 1 }];
    outcome.salvageProvenance = [{ kind: 'weapon', itemId: weaponId, sourceDesignId: 'halberd_prime', sourceMechName: 'Halberd', location: 'left_arm' }];
    const recovered = () => campaignPilotMemories(catalog, state, deployment.lance).find((cue) => cue.kind === 'recovered_weapon');
    expect(recovered()).toBeUndefined();
    outcome.salvagedItems = [...outcome.salvageOffered];
    expect(recovered()).toBeUndefined();
    outcome.salvageFinalized = true;
    expect(recovered()).toMatchObject({ kind: 'recovered_weapon', weaponId });
    outcome.salvageProvenance = [];
    expect(recovered()).toBeUndefined();
  });

  it('does not invent refits or recovered equipment in a legacy report without weapon snapshots', () => {
    const { state, deployment, report } = fielded();
    delete report.weaponLayout;
    delete report.weaponIds;
    mountNewWeapon(deployment);
    const raw = serialiseCampaign(state);
    const loaded = deserialiseCampaign(raw, catalog);
    expect(loaded.error).toBeNull();
    expect(loaded.state!.pilots[0]!.radioMemories).toBeUndefined();
    expect(campaignPilotMemories(catalog, loaded.state!, prepareDeployment(catalog, loaded.state!).lance)
      .every((cue) => cue.kind !== 'refit' && cue.kind !== 'recovered_weapon')).toBe(true);
  });

  it('recognises familiar ground only for a pilot with a recorded deployment there', () => {
    const { state, deployment, pair } = fielded();
    expect(campaignPilotMemories(catalog, state, deployment.lance)).toContainEqual(expect.objectContaining({ kind: 'revisit', pilotId: pair.pilot.id }));
    for (const outcome of state.history) outcome.pilotReports = outcome.pilotReports.filter((report) => report.pilotId !== pair.pilot.id);
    expect(campaignPilotMemories(catalog, state, deployment.lance).some((cue) => cue.pilotId === pair.pilot.id)).toBe(false);
  });

  it('bounds the persisted recollections and never changes random or mechanical state', () => {
    const { state, pair } = fielded();
    const before = JSON.stringify([state.rng, state.mechs, state.cbills, state.completedNodes]);
    for (let i = 0; i < 70; i += 1) rememberPilotCue(state, { pilotId: pair.pilot.id, templateId: pair.pilot.templateId, kind: 'revisit', key: `map:${i}` });
    expect(pair.pilot.radioMemories).toHaveLength(64);
    expect(pair.pilot.radioMemories!.at(-1)).toBe('map:69');
    expect(JSON.stringify([state.rng, state.mechs, state.cbills, state.completedNodes])).toBe(before);
  });
});
