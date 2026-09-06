import type { RefitAvailability } from '../../campaign/refitQuote';
import type { MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { bestAmmoLocation } from './autoFit';
import { evaluateEdit, type EditEvaluation } from './editPreview';
import type { BayStatus } from './BayChrome';
import { MECH_LOCATION_NAMES, type DropPayload } from './LocationCard';
import type { Shelf } from './StoreShelf';

export function createBayEditAcceptor({ catalog, inventory, commitDraft, setStatus, setSelectedLocation, setArmed, setShelf, setInspected }: {
  catalog: Catalog;
  inventory?: RefitAvailability;
  commitDraft: (design: Design) => void;
  setStatus: (status: BayStatus | null) => void;
  setSelectedLocation: (location: MechLocation | null) => void;
  setArmed: (payload: DropPayload | null) => void;
  setShelf: (shelf: Shelf) => void;
  setInspected: (payload: DropPayload | null) => void;
}) {
  return (
    evaluation: EditEvaluation,
    location: MechLocation | null = null,
  ): boolean => {
    if (evaluation.status === 'blocked') {
      if (location !== null) setSelectedLocation(location);
      setStatus({
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
        commitDraft(stowed.nextDesign);
        if (location !== null) setSelectedLocation(location);
        setArmed(null);
        setStatus({
          tone: 'ok',
          text: `${weaponName} fitted — one ton of ammunition stowed in the ${MECH_LOCATION_NAMES[berth].toLowerCase()}.`,
        });
        return true;
      }

      // No berth would take it automatically; fall back to letting the player place it.
      commitDraft(evaluation.nextDesign);
      const payload: DropPayload = { kind: 'ammo', id: weaponId };
      setSelectedLocation(null);
      setShelf('ammo');
      setInspected(payload);
      setArmed(payload);
      setStatus({ tone: 'ok', text: evaluation.reasons[0]?.message ?? 'Choose an ammunition bin.' });
      return true;
    }

    commitDraft(evaluation.nextDesign);

    if (location !== null) setSelectedLocation(location);
    setArmed(null);
    setStatus(null);
    return true;
  };

}
