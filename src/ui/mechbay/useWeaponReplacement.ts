import { useMemo, useState } from 'react';
import type { RefitAvailability } from '../../campaign/refitQuote';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import type { MechLocation } from '../../schema/common';
import type { DropPayload } from './dropPayload';
import { confirmWeaponReplacement, evaluateWeaponReplacement, replacementFits, type ReplacementRequest } from './weaponReplacement';

export function useWeaponReplacement({ catalog, design, inventory, targeting, onCommit, onFinished, onClearDrag }: {
  catalog: Catalog;
  design: Design;
  inventory?: RefitAvailability;
  targeting: DropPayload | null;
  onCommit: (design: Design) => void;
  onFinished: (location: MechLocation, payload: DropPayload) => void;
  onClearDrag: () => void;
}) {
  const [request, setRequest] = useState<ReplacementRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fits = useMemo(() => targeting?.kind === 'weapon'
    ? replacementFits(catalog, design, targeting.id, inventory) : new Map(), [catalog, design, inventory, targeting]);
  const preview = useMemo(() => request === null ? null
    : evaluateWeaponReplacement(catalog, request.source, request.index, request.weaponId, inventory), [catalog, request, inventory]);
  const close = (): void => { setRequest(null); setError(null); };
  const open = (payload: DropPayload, index: number): void => {
    onClearDrag();
    if (payload.kind !== 'weapon' || design.mounts[index] === undefined || !catalog.weapons.has(payload.id)) return;
    setRequest({ index, weaponId: payload.id, source: structuredClone(design) });
    setError(null);
  };
  const confirm = (): void => {
    if (request === null) return;
    const outcome = confirmWeaponReplacement(catalog, design, request, inventory);
    const location = design.mounts[request.index]?.location;
    if (outcome.nextDesign === null || location === undefined) {
      setError(outcome.reason ?? 'This replacement is no longer available.');
      return;
    }
    onCommit(outcome.nextDesign);
    onFinished(location, { kind: 'weapon', id: request.weaponId });
    close();
  };
  return { request, preview, error, fits, open, close, confirm };
}
