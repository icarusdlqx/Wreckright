import { useEffect, useRef, type RefObject } from 'react';
import type { Catalog } from '../schema/load';
import { LazyMechbay } from './mechbay/LazyMechbay';
import type { BayCommission } from './mechbay/Mechbay';
import type { AudioDirector } from './audio';
import { berthDesign, type SkirmishBerth } from './lance';
import { useDialogFocus } from './useDialogFocus';

interface IsolatedState {
  element: HTMLElement;
  inert: boolean;
  ariaHidden: string | null;
}

export function isolateModalBackground(backdrop: HTMLElement): () => void {
  const parent = backdrop.parentElement;
  if (parent === null) return () => undefined;
  const states: IsolatedState[] = Array.from(parent.children)
    .filter((element) => element !== backdrop)
    .map((element) => ({
      element: element as HTMLElement,
      inert: (element as HTMLElement).inert,
      ariaHidden: element.getAttribute('aria-hidden'),
    }));

  for (const state of states) {
    state.element.inert = true;
    state.element.setAttribute('aria-hidden', 'true');
  }

  return () => {
    for (const state of states) {
      state.element.inert = state.inert;
      if (state.ariaHidden === null) state.element.removeAttribute('aria-hidden');
      else state.element.setAttribute('aria-hidden', state.ariaHidden);
    }
  };
}

function useModalBackgroundIsolation(backdropRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const backdrop = backdropRef.current;
    return backdrop === null ? undefined : isolateModalBackground(backdrop);
  }, [backdropRef]);
}

export function createBattleOutfitBay(
  catalog: Catalog,
  lance: readonly SkirmishBerth[],
  berthIndex: number | null,
  setLance: (lance: SkirmishBerth[]) => void,
  onClose: () => void,
): BayCommission | null {
  if (berthIndex === null) return null;
  const berth = lance[berthIndex];
  if (berth === undefined) return null;
  const design = berthDesign(catalog, berth) ?? catalog.designs.get('sentinel_brawler');
  if (design === undefined) return null;
  return {
    title: `Berth ${berthIndex + 1}`,
    cancelLabel: 'Back to briefing',
    design,
    onCancel: onClose,
    onCommit: (committedDesign) => {
      const next = lance.map((entry) => ({ ...entry }));
      const target = next[berthIndex];
      if (target === undefined) return { ok: false, reason: 'no such berth' };
      target.designId = null;
      target.design = committedDesign;
      setLance(next);
      onClose();
      return { ok: true, reason: null };
    },
  };
}

export function OutfitBayDialog({
  bay,
  battleAudio,
  onMuted,
  onClose,
}: {
  bay: BayCommission;
  battleAudio: AudioDirector;
  onMuted: (muted: boolean) => void;
  onClose: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Register isolation first so its cleanup restores the trigger before the
  // focus hook returns focus to it.
  useModalBackgroundIsolation(backdropRef);
  useDialogFocus(dialogRef, dialogRef, onClose);

  return (
    <div ref={backdropRef} className="manifest-backdrop" data-testid="outfit-bay">
      <div
        ref={dialogRef}
        className="refit-bay"
        role="dialog"
        aria-modal="true"
        aria-label={`Refit ${bay.title}`}
        tabIndex={-1}
      >
        <LazyMechbay
          onExit={onClose}
          commission={bay}
          battleAudio={battleAudio}
          onBattleMuted={onMuted}
        />
      </div>
    </div>
  );
}
