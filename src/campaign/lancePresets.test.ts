import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { acceptContract, availableNodes, startCampaign } from './campaign';
import { deploymentPlan, dropTeam, missionSlots, prepareDeployment } from './deployment';
import { autoFillDeployment, chooseDeployment, loadLancePreset, saveLancePreset } from './lancePresets';
import { deserialiseCampaign, serialiseCampaign } from './save';

function signedCompany() {
  const state = startCampaign(catalog, 'border_dispute', 'chosen-lance');
  expect(acceptContract(catalog, state, availableNodes(catalog, state)[0]!.id, 'standard').ok).toBe(true);
  return state;
}

function missionCatalog(missionId: string, cap: number | undefined, allowance = 2000) {
  const mission = catalog.missions.get(missionId)!;
  return { ...catalog, missions: new Map([...catalog.missions, [missionId, { ...mission, maxPlayerUnits: cap, dropTonnage: allowance }]]) };
}

describe('commander chosen deployment', () => {
  it('keeps the chosen order and leaves unselected healthy pilots in reserve', () => {
    const state = signedCompany();
    const ids = [state.pilots[2]!.id, state.pilots[0]!.id];
    chooseDeployment(state, ids);
    expect(dropTeam(catalog, state, state.contract!.missionId).map((pair) => pair.pilot.id)).toEqual(ids);
    expect(prepareDeployment(catalog, state).lance.map((pair) => pair.pilot.id)).toEqual(ids);
    expect(state.benched).toEqual(state.pilots.filter((pilot) => !ids.includes(pilot.id)).map((pilot) => pilot.id));
  });

  it('uses five normal berths and validates an authored one-machine mission', () => {
    const state = signedCompany();
    const missionId = state.contract!.missionId;
    const normal = missionCatalog(missionId, undefined);
    expect(missionSlots(normal, missionId)).toBe(5);
    const single = missionCatalog(missionId, 1);
    chooseDeployment(state, state.pilots.slice(0, 2).map((pilot) => pilot.id));
    expect(deploymentPlan(single, state, missionId).issues).toContain('This mission permits 1 machine.');
    expect(() => prepareDeployment(single, state)).toThrow('permits 1 machine');
    autoFillDeployment(single, state, missionId);
    expect(prepareDeployment(single, state).lance).toHaveLength(1);
  });

  it('does not silently trim an overweight choice, and autofill is an explicit alternative', () => {
    const state = signedCompany();
    const missionId = state.contract!.missionId;
    const light = missionCatalog(missionId, undefined, 60);
    chooseDeployment(state, state.pilots.map((pilot) => pilot.id));
    const requested = [...state.deploymentSelection!];
    expect(dropTeam(light, state, missionId)).toEqual([]);
    expect(deploymentPlan(light, state, missionId).issues.join()).toContain('over the mission allowance');
    expect(state.deploymentSelection).toEqual(requested);
    autoFillDeployment(light, state, missionId);
    expect(deploymentPlan(light, state, missionId).tonnage).toBeLessThanOrEqual(60);
    expect(prepareDeployment(light, state).lance.length).toBeGreaterThan(0);
  });

  it('persists presets and chosen seats, while legacy saves retain bench intent', () => {
    const state = signedCompany();
    const ids = [state.pilots[0]!.id, state.pilots[2]!.id];
    chooseDeployment(state, ids);
    expect(saveLancePreset(catalog, state, state.contract!.missionId, 'Patrol')).toBe('Saved Patrol.');
    const restored = deserialiseCampaign(serialiseCampaign(state), catalog).state!;
    expect(restored.deploymentSelection).toEqual(ids);
    expect(restored.lancePresets).toEqual(state.lancePresets);
    const old = JSON.parse(serialiseCampaign(state));
    delete old.state.deploymentSelection;
    delete old.state.lancePresets;
    const migrated = deserialiseCampaign(JSON.stringify(old), catalog).state!;
    expect(migrated.deploymentSelection).toBeNull();
    expect(migrated.lancePresets).toEqual([]);
    expect(migrated.benched).toEqual(state.benched);
    expect(dropTeam(catalog, migrated, state.contract!.missionId).map((pair) => pair.pilot.id)).toEqual(ids);
  });

  it('loads exact machines and refuses wounded, dead or missing seats without resurrecting anyone', () => {
    const state = signedCompany();
    const [first, second] = state.pilots;
    chooseDeployment(state, [first!.id, second!.id]);
    saveLancePreset(catalog, state, state.contract!.missionId, 'Heavy');
    const originalMachine = first!.mechId;
    first!.mechId = null;
    loadLancePreset(state, 'Heavy');
    expect(first!.mechId).toBe(originalMachine);
    first!.recoveryMissions = 1;
    loadLancePreset(state, 'Heavy');
    expect(deploymentPlan(catalog, state, state.contract!.missionId).issues.join()).toContain('wounded');
    expect(dropTeam(catalog, state, state.contract!.missionId)).toEqual([]);
    first!.dead = true;
    first!.mechId = null;
    loadLancePreset(state, 'Heavy');
    expect(first!.dead).toBe(true);
    expect(first!.mechId).toBeNull();
    expect(deploymentPlan(catalog, state, state.contract!.missionId).issues.join()).toContain('no longer on the active roster');
    state.pilots = state.pilots.filter((pilot) => pilot.id !== first!.id);
    loadLancePreset(state, 'Heavy');
    expect(deploymentPlan(catalog, state, state.contract!.missionId).pilotIds).toContain(first!.id);
    expect(() => prepareDeployment(catalog, state)).toThrow('no longer on the active roster');
  });

  it('surfaces a sold preset machine and lets an intentionally empty lance remain empty', () => {
    const state = signedCompany();
    const pilot = state.pilots[0]!;
    chooseDeployment(state, [pilot.id]);
    saveLancePreset(catalog, state, state.contract!.missionId, 'Scout');
    state.mechs = state.mechs.filter((mech) => mech.id !== pilot.mechId);
    pilot.mechId = null;
    loadLancePreset(state, 'Scout');
    expect(deploymentPlan(catalog, state, state.contract!.missionId).issues.join()).toContain('needs an armed, fieldable machine');
    chooseDeployment(state, []);
    expect(state.deploymentSelection).toEqual([]);
    expect(() => prepareDeployment(catalog, state)).toThrow('Choose at least one');
  });
});
