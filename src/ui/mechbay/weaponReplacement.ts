import type { RefitAvailability } from '../../campaign/refitQuote';
import type { MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { bestAmmoLocation } from './autoFit';
import { evaluateEdit, type EditEvaluation } from './editPreview';

export interface ReplacementRequest {
  readonly index: number;
  readonly weaponId: string;
  readonly source: Design;
}

export interface WeaponReplacement {
  readonly ok: boolean;
  readonly reason: string | null;
  readonly evaluation: EditEvaluation;
  readonly ammoLocation: MechLocation | null;
}

/** The complete candidate stays outside draft history until the player confirms. */
export function evaluateWeaponReplacement(
  catalog: Catalog,
  design: Design,
  index: number,
  weaponId: string,
  inventory?: RefitAvailability,
): WeaponReplacement {
  const replacement = evaluateEdit(catalog, design, { type: 'replace_weapon', index, weaponId }, inventory);
  if (design.mounts[index]?.weaponId === weaponId) {
    return { ok: false, reason: 'That weapon is already installed here.', evaluation: replacement, ammoLocation: null };
  }
  if (replacement.status === 'blocked') {
    return { ok: false, reason: replacement.reasons[0]?.message ?? 'This replacement cannot be fitted.', evaluation: replacement, ammoLocation: null };
  }
  if (replacement.status === 'applied') {
    return { ok: true, reason: null, evaluation: replacement, ammoLocation: null };
  }
  const location = bestAmmoLocation(catalog, replacement.nextDesign, replacement.continuation.locations);
  if (location !== null) {
    const stowed = evaluateEdit(catalog, replacement.nextDesign, {
      type: 'add_ammo', weaponId, location,
    }, inventory);
    if (stowed.status === 'applied') {
      return {
        ok: true, reason: null, ammoLocation: location,
        evaluation: { ...stowed, deltas: [...replacement.deltas, ...stowed.deltas] },
      };
    }
  }
  return {
    ok: false, reason: 'No room for the required ammunition bin. Free fitting space before replacing this weapon.',
    evaluation: replacement, ammoLocation: null,
  };
}

/** Recheck both stock and the original draft so a stale preview cannot replace a different gun. */
export function confirmWeaponReplacement(
  catalog: Catalog,
  design: Design,
  request: ReplacementRequest,
  inventory?: RefitAvailability,
): { nextDesign: Design | null; reason: string | null } {
  if (JSON.stringify(design) !== JSON.stringify(request.source)) {
    return { nextDesign: null, reason: 'The loadout changed. Close this preview and choose the weapon again.' };
  }
  const candidate = evaluateWeaponReplacement(catalog, design, request.index, request.weaponId, inventory);
  return { nextDesign: candidate.ok ? candidate.evaluation.nextDesign : null, reason: candidate.reason };
}

export function replacementFits(
  catalog: Catalog,
  design: Design,
  weaponId: string,
  inventory?: RefitAvailability,
): ReadonlyMap<number, WeaponReplacement> {
  return new Map(design.mounts.map((_, index) => [
    index, evaluateWeaponReplacement(catalog, design, index, weaponId, inventory),
  ]));
}
