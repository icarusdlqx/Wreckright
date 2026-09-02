import type { RefitAvailability } from '../../campaign/refitQuote';
import type { MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { bestAmmoLocation } from './autoFit';
import type { BayStatus } from './BayChrome';
import { evaluateEdit, type EditEvaluation } from './editPreview';
import { MECH_LOCATION_NAMES, type DropPayload } from './LocationCard';
import type { Shelf } from './StoreShelf';

/** The bay state one accepted edit is allowed to move. */
export interface BayEditActions {
  commitDraft: (next: Design) => void;
  setSelectedLocation: (location: MechLocation | null) => void;
  setArmed: (payload: DropPayload | null) => void;
  setInspected: (payload: DropPayload | null) => void;
  setShelf: (shelf: Shelf) => void;
  setStatus: (status: BayStatus | null) => void;
}

/**
 * Turns one evaluated edit into bay state: a blocked edit becomes a message,
 * an applied one becomes history, and a gun that needs feeding gets its first
 * ton stowed in the same commit so the swap or fit stays a single undo step.
 */
export function acceptBayEvaluation(
  catalog: Catalog,
  inventory: RefitAvailability | undefined,
  evaluation: EditEvaluation,
  location: MechLocation | null,
  bay: BayEditActions,
): boolean {
  if (evaluation.status === 'blocked') {
    if (location !== null) bay.setSelectedLocation(location);
    bay.setStatus({
      tone: 'error',
      text: evaluation.reasons[0]?.message ?? 'That change cannot be made.',
    });
    return false;
  }

  if (evaluation.status === 'needs_ammo') {
    const { weaponId, locations } = evaluation.continuation;
    const weaponName = catalog.weapons.get(weaponId)?.name ?? weaponId;
    // A gun with no feed is not a decision, it is a chore. Stow the first ton
    // somewhere survivable and say where it went; moving or removing it is
    // still one click, and the player never meets an illegal build they did
    // not ask for.
    const berth = bestAmmoLocation(catalog, evaluation.nextDesign, locations);
    const stowed =
      berth === null
        ? null
        : evaluateEdit(
            catalog,
            evaluation.nextDesign,
            { type: 'add_ammo', weaponId, location: berth },
            inventory,
          );

    if (berth !== null && stowed?.status === 'applied') {
      bay.commitDraft(stowed.nextDesign);
      if (location !== null) bay.setSelectedLocation(location);
      bay.setArmed(null);
      bay.setStatus({
        tone: 'ok',
        text: `${weaponName} fitted — one ton of ammunition stowed in the ${MECH_LOCATION_NAMES[berth].toLowerCase()}.`,
      });
      return true;
    }

    // No berth would take it automatically; fall back to letting the player place it.
    bay.commitDraft(evaluation.nextDesign);
    const payload: DropPayload = { kind: 'ammo', id: weaponId };
    bay.setSelectedLocation(null);
    bay.setShelf('ammo');
    bay.setInspected(payload);
    bay.setArmed(payload);
    bay.setStatus({ tone: 'ok', text: evaluation.reasons[0]?.message ?? 'Choose an ammunition bin.' });
    return true;
  }

  bay.commitDraft(evaluation.nextDesign);
  if (location !== null) bay.setSelectedLocation(location);
  bay.setArmed(null);
  bay.setStatus(null);
  return true;
}
