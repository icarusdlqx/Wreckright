import type { RefitAvailability } from '../../campaign/refitQuote';
import { LOCATIONS, type MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import type { InspectorFit } from './Dossier';
import { evaluateEdit } from './editPreview';
import type { DropPayload } from './LocationCard';
import { evaluateDrop } from './mechbayEdits';

/** A fitted gun the player wants replaced where it sits. */
export interface SwapRequest {
  index: number;
  location: MechLocation;
  weaponId: string;
}

function fitAt(
  catalog: Catalog,
  design: Design,
  payload: DropPayload,
  location: MechLocation,
  availability?: RefitAvailability,
): InspectorFit {
  const evaluation = evaluateDrop(catalog, design, payload, location, availability);
  if (evaluation.status === 'blocked') {
    return {
      ok: false,
      reason: evaluation.reasons[0]?.message ?? 'That part does not fit here.',
    };
  }
  return {
    ok: true,
    reason:
      evaluation.status === 'needs_ammo'
        ? 'Weapon fits here. Choose a separate ammunition-bin location next.'
        : null,
  };
}

/** Exact shelf fit, either for the selected location or anywhere on the machine. */
export function shelfFit(
  catalog: Catalog,
  design: Design,
  payload: DropPayload,
  availability: RefitAvailability | undefined,
  selectedLocation: MechLocation | null,
): InspectorFit {
  if (selectedLocation !== null) {
    return fitAt(catalog, design, payload, selectedLocation, availability);
  }
  const attempts = LOCATIONS.map((location) =>
    fitAt(catalog, design, payload, location, availability));
  if (attempts.some((fit) => fit.ok)) return { ok: true, reason: null };
  return {
    ok: false,
    reason:
      attempts.find((fit) => fit.reason !== null)?.reason
      ?? 'No compatible location remains on this machine.',
  };
}

/**
 * Whether a shelf weapon could take a fitted gun's place in one edit. Judged
 * as a replacement rather than an install, so the outgoing gun's slots and
 * hardpoint count as free and its ammunition leaves with it.
 */
export function swapFit(
  catalog: Catalog,
  design: Design,
  swap: SwapRequest,
  weaponId: string,
  availability: RefitAvailability | undefined,
): InspectorFit {
  const evaluation = evaluateEdit(
    catalog,
    design,
    { type: 'replace_weapon', index: swap.index, weaponId },
    availability,
  );
  if (evaluation.status === 'blocked') {
    return {
      ok: false,
      reason: evaluation.reasons[0]?.message ?? 'That weapon cannot take this mount.',
    };
  }
  return {
    ok: true,
    reason: evaluation.status === 'needs_ammo'
      ? 'Swaps in here; a ton of its ammunition is stowed with it.'
      : null,
  };
}
