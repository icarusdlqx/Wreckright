import { useEffect, useRef, type RefObject } from 'react';
import type { Catalog } from '../schema/load';
import { LazyMechbay } from './mechbay/LazyMechbay';
import type { BayCommission } from './mechbay/Mechbay';
import type { AudioDirector } from './audio';
import { berthDesign, type SkirmishBerth, type SkirmishFaction } from './lance';
import { skirmishDesignAllowed, skirmishFactionName } from './skirmishFaction';
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
  side: 'player' | 'enemy' = 'player',
  faction: SkirmishFaction = 'mixed',
): BayCommission | null {
  if (berthIndex === null) return null;
  const berth = lance[berthIndex];
  if (berth === undefined) return null;
  const starter = faction === 'mixed' ? catalog.designs.get('sentinel_brawler') : [...catalog.designs.values()]
    .filter((candidate) => skirmishDesignAllowed(catalog, candidate, faction))
    .sort((left, right) => (catalog.chassis.get(left.chassisId)?.tonnage ?? 0)
      - (catalog.chassis.get(right.chassisId)?.tonnage ?? 0) || left.id.localeCompare(right.id))[0];
  const design = berthDesign(catalog, berth) ?? starter;
  if (design === undefined) return null;
  return {
    title: `${side === 'enemy' ? 'Enemy berth' : 'Berth'} ${berthIndex + 1}`,
    cancelLabel: 'Back to briefing',
    design,
    onCancel: onClose,
    onCommit: (committedDesign) => {
      if (!skirmishDesignAllowed(catalog, committedDesign, faction)) {
        return { ok: false, reason: `Choose a ${skirmishFactionName(faction)} mech, or select Mixed company in the briefing.` };
      }
      const next = lance.map((entry) => ({ ...entry }));
      const target = next[berthIndex];
      if (target === undefined) return { ok: false, reason: 'no such berth' };
      delete target.empty;
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
  useDialogFocus(dialogRef, dialogRef);

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
