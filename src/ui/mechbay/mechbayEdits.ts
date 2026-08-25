import type { RefitAvailability } from '../../campaign/refitQuote';
import type { MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { evaluateEdit, type EditEvaluation, type EditIntent } from './editPreview';
import type { DropPayload } from './LocationCard';

export function installIntent(payload: DropPayload, location: MechLocation): EditIntent {
  if (payload.kind === 'weapon') {
    return { type: 'install_weapon', weaponId: payload.id, location };
  }
  if (payload.kind === 'ammo') {
    return { type: 'add_ammo', weaponId: payload.id, location };
  }
  return { type: 'install_equipment', equipmentId: payload.id, location };
}

export function evaluateDrop(
  catalog: Catalog,
  design: Design,
  payload: DropPayload,
  location: MechLocation,
  availability?: RefitAvailability,
): EditEvaluation {
  return evaluateEdit(catalog, design, installIntent(payload, location), availability);
}
