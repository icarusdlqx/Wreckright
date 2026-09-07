import type { Catalog } from '../schema/load';
import type { PilotPersonality } from '../schema/pilotPersonality';

export interface VoicedPilot {
  id: string;
  templateId?: string;
  personality?: PilotPersonality;
}

/** Older company files and battle copies need no new saved fields to keep their voice. */
export function pilotPersonality(catalog: Catalog, pilot: VoicedPilot): PilotPersonality | undefined {
  return pilot.personality ?? catalog.pilots.get(pilot.templateId ?? pilot.id)?.personality;
}
