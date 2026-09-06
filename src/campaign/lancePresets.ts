import type { Catalog } from '../schema/load';
import { assign } from './roster';
import { deploymentCandidates, deploymentPlan } from './deployment';
import type { CampaignState } from './types';

export function chooseDeployment(state: CampaignState, pilotIds: readonly string[]): void {
  const ids = [...new Set(pilotIds)];
  const candidates = deploymentCandidates(state);
  for (const id of ids) {
    const pair = candidates.find((entry) => entry.pilot.id === id);
    if (pair !== undefined && pair.pilot.mechId !== pair.mech.id) assign(state, id, pair.mech.id);
  }
  state.deploymentSelection = ids;
  state.benched = state.pilots.filter((pilot) => !ids.includes(pilot.id)).map((pilot) => pilot.id);
}

export function autoFillDeployment(catalog: Catalog, state: CampaignState, missionId: string): void {
  const plan = deploymentPlan(catalog, { ...state, deploymentSelection: null, benched: [] }, missionId);
  chooseDeployment(state, plan.pilotIds);
}

export function saveLancePreset(catalog: Catalog, state: CampaignState, missionId: string, label: string): string {
  const name = label.trim().slice(0, 40);
  if (!name) return 'Give this lance a name.';
  const plan = deploymentPlan(catalog, state, missionId);
  if (plan.issues.length > 0) return 'Choose a fieldable lance before saving a preset.';
  const existing = state.lancePresets.findIndex((preset) => preset.name.toLowerCase() === name.toLowerCase());
  if (existing < 0 && state.lancePresets.length >= 6) return 'Six presets are saved. Update or remove one first.';
  const preset = { name, seats: plan.pairs.map((pair) => ({ pilotId: pair.pilot.id, mechId: pair.mech.id })) };
  if (existing < 0) state.lancePresets.push(preset);
  else state.lancePresets[existing] = preset;
  return `Saved ${name}.`;
}

export function loadLancePreset(state: CampaignState, name: string): void {
  const preset = state.lancePresets.find((entry) => entry.name === name);
  if (preset === undefined) return;
  // Preserve the requested seats even if somebody is wounded or a hull was sold.
  // The manifest explains each problem and requires an explicit replacement.
  for (const seat of preset.seats) {
    const pilot = state.pilots.find((entry) => entry.id === seat.pilotId);
    if (pilot === undefined || pilot.dead) continue;
    assign(state, pilot.id, seat.mechId);
  }
  state.deploymentSelection = preset.seats.map((seat) => seat.pilotId);
  state.benched = state.pilots.filter((pilot) => !state.deploymentSelection?.includes(pilot.id)).map((pilot) => pilot.id);
}
