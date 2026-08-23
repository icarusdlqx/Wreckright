import { useEffect, type RefObject } from 'react';
import type { MechLocation } from '../../schema/common';
import type { DropPayload } from './LocationCard';

const MOBILE_PLACEMENT_QUERY =
  '(max-width: 640px), (pointer: coarse) and (max-width: 1100px)';

export function armedPlacementTarget(
  selectedLocation: MechLocation | null,
  compatibleLocations: ReadonlySet<MechLocation>,
): MechLocation | null {
  return selectedLocation ?? compatibleLocations.values().next().value ?? null;
}

/**
 * Once a shelf item is armed, put every input method on the same next step.
 * Touch layouts also scroll the target into view; desktop keyboard users still
 * receive focus without an unexpected page jump for pointer activation.
 */
export function useArmedPlacementFocus({
  armed,
  bayRef,
  compatibleLocations,
  selectedLocation,
}: {
  armed: DropPayload | null;
  bayRef: RefObject<HTMLDivElement | null>;
  compatibleLocations: ReadonlySet<MechLocation>;
  selectedLocation: MechLocation | null;
}): void {
  useEffect(() => {
    if (armed === null) return;
    const bay = bayRef.current;
    const view = bay?.ownerDocument.defaultView;
    const target = armedPlacementTarget(selectedLocation, compatibleLocations);
    if (bay === null || view === null || view === undefined || target === null) return;

    const frame = view.requestAnimationFrame(() => {
      const card = bay.querySelector<HTMLElement>(`[data-testid="bay-location-${target}"]`);
      if (card === null) return;
      if (view.matchMedia(MOBILE_PLACEMENT_QUERY).matches) {
        card.scrollIntoView({ block: 'center' });
      }
      card.querySelector<HTMLButtonElement>('.bay-location-name')?.focus({ preventScroll: true });
    });
    return () => view.cancelAnimationFrame(frame);
  }, [armed, bayRef, compatibleLocations, selectedLocation]);
}
