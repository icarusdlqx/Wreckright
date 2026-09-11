import type { RefitAvailability } from '../../campaign/refitQuote';
import type { MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { evaluateEdit, type EditEvaluation, type EditIntent } from './editPreview';
import { blockedEdit, editReason } from './editPreviewSupport';
import type { DropPayload } from './LocationCard';

export function installIntent(payload: DropPayload, location: MechLocation): EditIntent {
  if (payload.kind === 'weapon') {
    return payload.sourceIndex === undefined
      ? { type: 'install_weapon', weaponId: payload.id, location }
      : { type: 'move_weapon', index: payload.sourceIndex, location };
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
  if (payload.sourceIndex !== undefined && design.mounts[payload.sourceIndex]?.weaponId !== payload.id) {
    return blockedEdit(catalog, design, [editReason('unknown_mount', 'intent', 'weapon',
      'This fitted weapon changed. Pick it up again before moving it.')]);
  }
  return evaluateEdit(catalog, design, installIntent(payload, location), availability);
}
