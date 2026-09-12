import { campaignPilotMemories, rememberPilotCue, type PilotMemoryCue } from '../campaign/pilotContinuity';
import type { Deployment } from '../campaign/deployment';
import { loadCampaign, saveCampaign } from '../campaign/save';
import type { CampaignState } from '../campaign/types';
import type { Catalog } from '../schema/load';
import { PILOT_CONTINUITY } from '../schema/pilotContinuity';
import type { World } from '../sim/types';
import { attachFieldRadioMemories, type FieldRadioMemory } from './fieldRadio';

/** Never replace a newer company if a stale battlefield finishes a queued remark. */
export function persistCampaignMemory(catalog: Catalog, source: CampaignState, cue: PilotMemoryCue): boolean {
  const current = loadCampaign(catalog).state;
  if (current === null || current.campaignId !== source.campaignId || current.seed !== source.seed
    || current.contract?.nodeId !== source.contract?.nodeId || current.day !== source.day
    || current.contract === null) return false;
  if (!rememberPilotCue(current, cue)) return false;
  saveCampaign(current);
  return true;
}

export function campaignRadioFor(catalog: Catalog, state: CampaignState, deployment: Deployment): (world: World) => void {
  const facts = campaignPilotMemories(catalog, state, deployment.lance);
  return (world) => {
    const entities = world.entities.filter((entity) => entity.team === deployment.playerTeam);
    const cues: FieldRadioMemory[] = [];
    for (const [index, pair] of deployment.lance.entries()) {
      const entity = entities[index];
      if (entity === undefined || entity.pilot.id !== pair.pilot.templateId) continue;
      const pilotFacts = facts.filter((fact) => fact.pilotId === pair.pilot.id);
      // A recovered gun earns its own first-fire remark; a generic refit or
      // familiar-ground line must not spend that pilot's sole memory earlier.
      const chosen = pilotFacts.find((fact) => fact.kind === 'return')
        ?? pilotFacts.find((fact) => fact.kind === 'recovered_weapon')
        ?? pilotFacts.find((fact) => fact.kind === 'refit')
        ?? pilotFacts.find((fact) => fact.kind === 'revisit');
      if (chosen === undefined) continue;
      const faction = catalog.chassis.get(pair.mech.design.chassisId)?.faction ?? 'linewrought';
      const lines = PILOT_CONTINUITY.pilots[pair.pilot.templateId] ?? PILOT_CONTINUITY.fallback[faction];
      cues.push({ entityId: entity.id, text: lines[chosen.kind],
        trigger: chosen.kind === 'recovered_weapon' ? 'weapon' : 'move',
        ...(chosen.weaponId === undefined ? {} : { weaponId: chosen.weaponId }),
        onHeard: () => { persistCampaignMemory(catalog, state, chosen); },
      });
    }
    attachFieldRadioMemories(world, cues);
  };
}
