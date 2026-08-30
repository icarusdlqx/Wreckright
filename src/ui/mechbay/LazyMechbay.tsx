import { lazy, Suspense } from 'react';
import type { AudioDirector } from '../audio';
import type { BayCommission } from './Mechbay';

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
  commission?: BayCommission;
  battleAudio?: AudioDirector;
  onBattleMuted?: (muted: boolean) => void;
}

export function LazyMechbay({ onExit, commission, battleAudio, onBattleMuted }: Props) {
  return (
    <Suspense
      fallback={
        <div className="route-loading" role="status" data-testid="route-loading">
          Opening the bay…
        </div>
      }
    >
      <Mechbay
        onExit={onExit}
        {...(commission === undefined ? {} : { commission })}
        {...(battleAudio === undefined ? {} : { battleAudio })}
        {...(onBattleMuted === undefined ? {} : { onBattleMuted })}
      />
    </Suspense>
  );
}
