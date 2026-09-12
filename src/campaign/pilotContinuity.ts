import type { Catalog } from '../schema/load';
import type { Design } from '../schema/design';
import type { DeployablePair } from './deployment';
import { isPilotAvailable, type CampaignState, type PilotRecord } from './types';

export type PilotMemoryKind = 'return' | 'refit' | 'recovered_weapon' | 'revisit';
export interface PilotMemoryCue {
  pilotId: string;
  templateId: string;
  kind: PilotMemoryKind;
  key: string;
  weaponId?: string;
}

/** Reordering identical mounts or renaming a blueprint is not a new firing layout. */
export function weaponLayoutIdentity(design: Design): string {
  return `${design.chassisId}:${design.mounts.map((mount) =>
    `${mount.location}/${mount.weaponId}/${mount.modeId ?? ''}`).sort().join('|')}`;
}

function remembered(pilot: PilotRecord, key: string): boolean {
  return pilot.radioMemories?.includes(key) ?? false;
}

/** Facts come from resolved deployments and claimed salvage; missing old facts stay unknown. */
export function campaignPilotMemories(catalog: Catalog, state: CampaignState, lance: readonly DeployablePair[]): PilotMemoryCue[] {
  if (state.contract === null) return [];
  const mapId = catalog.missions.get(state.contract.missionId)?.mapId;
  const cues: PilotMemoryCue[] = [];
  for (const { pilot, mech } of lance) {
    if (!isPilotAvailable(state, pilot)) continue;
    const reports = state.history.flatMap((outcome) => outcome.pilotReports
      .filter((report) => report.pilotId === pilot.id).map((report) => ({ outcome, report })));
    const latest = reports.at(-1);
    const add = (kind: PilotMemoryKind, key: string, weaponId?: string): void => {
      if (!remembered(pilot, key)) cues.push({ pilotId: pilot.id, templateId: pilot.templateId, kind, key,
        ...(weaponId === undefined ? {} : { weaponId }) });
    };
    if (latest?.report.fate === 'injured') {
      add('return', `return:${latest.outcome.nodeId}:${latest.outcome.day}`);
    }
    // Shared stores cannot prove which of two identical guns was fitted. Only
    // recognise a recovered type newly added since this pilot's last drop.
    const weaponIds = new Set(latest?.report.weaponIds === undefined ? [] : mech.design.mounts
      .map((mount) => mount.weaponId).filter((id) => !latest.report.weaponIds!.includes(id)));
    const recovered = [...state.history].reverse().find((outcome) => outcome.salvageFinalized && outcome.won
      && outcome.salvagedItems.some((item) => item.kind === 'weapon' && weaponIds.has(item.itemId)
        && outcome.salvageProvenance.some((source) => source.kind === 'weapon' && source.itemId === item.itemId)));
    if (recovered !== undefined) {
      const weapon = recovered.salvagedItems.find((item) => item.kind === 'weapon' && weaponIds.has(item.itemId)
        && recovered.salvageProvenance.some((source) => source.kind === 'weapon' && source.itemId === item.itemId));
      if (weapon !== undefined) add('recovered_weapon', `recovered:${weapon.itemId}`, weapon.itemId);
    }
    const layout = weaponLayoutIdentity(mech.design);
    if (latest?.report.mechId === mech.id && latest.report.weaponLayout !== undefined
      && latest.report.weaponLayout !== layout) {
      add('refit', `refit:${mech.id}:${layout}`);
    }
    if (mapId !== undefined && reports.some(({ outcome }) => catalog.missions.get(outcome.missionId)?.mapId === mapId)) {
      add('revisit', `revisit:${mapId}`);
    }
  }
  return cues;
}

/** A spoken memory survives reload without growing the company file indefinitely. */
export function rememberPilotCue(state: CampaignState, cue: PilotMemoryCue): boolean {
  const pilot = state.pilots.find((entry) => entry.id === cue.pilotId && entry.templateId === cue.templateId);
  if (pilot === undefined || remembered(pilot, cue.key)) return false;
  pilot.radioMemories = [...(pilot.radioMemories ?? []), cue.key].slice(-64);
  return true;
}
