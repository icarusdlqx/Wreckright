import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import type { AudioDirector } from '../audio';
import type { BayCommission } from './Mechbay';
import './mechbayLoading.css';

/**
 * The mechbay behind one deferred chunk.
 *
 * Three call sites open the bay — the route, the refit dialog and the outfit
 * dialog — and each one is a static path from the entry chunk into three.js and
 * the whole model catalogue. Routing them all through a single lazy component
 * keeps that weight off the first paint and keeps the three of them sharing one
 * chunk rather than splitting into three copies.
 */
const Mechbay = lazy(() => import('./Mechbay').then((module) => ({ default: module.Mechbay })));

interface Props {
  onExit: () => void;
  exitLabel?: string;
  commission?: BayCommission;
  battleAudio?: AudioDirector;
  onBattleMuted?: (muted: boolean) => void;
  preparationContext?: ReactNode;
}

/** Only the unresolved bay owns this handler; loaded drafts keep their own exit guard. */
function MechbayLoading({ onCancel }: { onCancel: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || root.current?.closest('[inert]') !== null) return;
      event.preventDefault();
      event.stopPropagation();
      cancel.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return <div ref={root} className="route-loading bay-loading" data-testid="route-loading">
    <span role="status">Opening the bay…</span>
    <button type="button" data-testid="bay-loading-cancel" onClick={onCancel}>Cancel</button>
  </div>;
}

export function LazyMechbay({ onExit, exitLabel, commission, battleAudio, onBattleMuted, preparationContext }: Props) {
  return (
    <Suspense
      fallback={<MechbayLoading onCancel={commission?.onCancel ?? onExit} />}
    >
      <Mechbay
        onExit={onExit}
        {...(exitLabel === undefined ? {} : { exitLabel })}
        {...(commission === undefined ? {} : { commission })}
        {...(battleAudio === undefined ? {} : { battleAudio })}
        {...(onBattleMuted === undefined ? {} : { onBattleMuted })}
        {...(preparationContext === undefined ? {} : { preparationContext })}
      />
    </Suspense>
  );
}
