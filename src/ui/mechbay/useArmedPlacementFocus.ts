import { useEffect, type RefObject } from 'react';
import type { MechLocation } from '../../schema/common';
import type { DropPayload } from './LocationCard';
import type { WeaponReplacement } from './weaponReplacement';

const MOBILE_PLACEMENT_QUERY =
  '(max-width: 640px), (pointer: coarse) and (max-width: 1100px)';

export function armedPlacementTarget(
  selectedLocation: MechLocation | null,
  compatibleLocations: ReadonlySet<MechLocation>,
): MechLocation | null {
  return selectedLocation !== null && compatibleLocations.has(selectedLocation)
    ? selectedLocation : compatibleLocations.values().next().value ?? null;
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
  replacementMounts,
}: {
  armed: DropPayload | null;
  bayRef: RefObject<HTMLDivElement | null>;
  compatibleLocations: ReadonlySet<MechLocation>;
  selectedLocation: MechLocation | null;
  replacementMounts?: ReadonlyMap<number, WeaponReplacement>;
}): void {
  useEffect(() => {
    if (armed === null) return;
    const bay = bayRef.current;
    const view = bay?.ownerDocument.defaultView;
    const target = armedPlacementTarget(selectedLocation, compatibleLocations);
    if (bay === null || view === null || view === undefined) return;

    const frame = view.requestAnimationFrame(() => {
      const replacementIndex = [...(replacementMounts ?? [])].find(([, fit]) => fit.ok)?.[0];
      const replacementControl = replacementIndex === undefined ? null
        : bay.querySelector<HTMLButtonElement>(`[data-testid="replace-weapon-${replacementIndex}"]`);
      const card = target === null ? replacementControl
        : bay.querySelector<HTMLElement>(`[data-testid="bay-location-${target}"]`);
      if (card === null) return;
      if (view.matchMedia(MOBILE_PLACEMENT_QUERY).matches) {
        card.scrollIntoView({ block: 'center' });
      }
      (target === null ? replacementControl : card.querySelector<HTMLButtonElement>('.bay-location-name'))?.focus({ preventScroll: true });
    });
    return () => view.cancelAnimationFrame(frame);
  }, [armed, bayRef, compatibleLocations, selectedLocation, replacementMounts]);
}
