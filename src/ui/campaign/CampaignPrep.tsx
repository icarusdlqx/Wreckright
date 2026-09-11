import { useRef, type ReactNode } from 'react';
import type { CampaignState } from '../../campaign/types';
import type { Catalog } from '../../schema/load';
import { LazyMechbay } from '../mechbay/LazyMechbay';
import type { BayCommission } from '../mechbay/Mechbay';
import { useDialogFocus } from '../useDialogFocus';
import { LanceManifest } from './LanceManifest';
import { DeploymentStrip } from './DeploymentStrip';
import { deploymentPlan } from '../../campaign/deployment';
import type { FirstDropPrep } from './firstDropGuide';

interface Props {
  catalog: Catalog;
  state: CampaignState;
  prep: FirstDropPrep;
  refitting: string | null;
  refitBay: BayCommission | null;
  mutate: (change: (draft: CampaignState) => string | null | void, message?: string) => void;
  onPrep: (prep: FirstDropPrep) => void;
  onRefit: (mechId: string | null) => void;
  onManifest: () => void;
  onLaunch: () => void;
  persistent?: boolean;
}

export function CampaignPrep({
  catalog,
  state,
  prep,
  refitting,
  refitBay,
  mutate,
  onPrep,
  onRefit,
  onManifest,
  onLaunch,
  persistent = true,
}: Props) {
  if (state.finished) return null;

  return (
    <>
      {prep !== null ? (
        <LanceManifest
          catalog={catalog}
          state={state}
          mutate={mutate}
          onLaunch={onLaunch}
          onCancel={() => onPrep(null)}
          onRefit={onRefit}
          hidden={refitting !== null}
          persistent={persistent}
          onView={(view) => { onPrep(view === 'machines' ? 'bay' : 'manifest'); if (view === 'pilots') onManifest(); }}
        />
      ) : null}

      {refitBay === null ? null : <RefitDialog bay={refitBay} onClose={() => onRefit(null)}
        context={prep === null || state.contract === null ? undefined : <PreparationContext catalog={catalog} state={state} mechId={refitting} />} />}
    </>
  );
}

function RefitDialog({ bay, onClose, context }: { bay: BayCommission; onClose: () => void; context?: ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // The bay owns Escape so its unsaved draft guard also covers keyboard exits.
  useDialogFocus(dialogRef, dialogRef);
  return (
    <div className="manifest-backdrop" data-testid="refit-bay">
      <div
        className="refit-bay"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Refit ${bay.title}`}
        tabIndex={-1}
      >
        <LazyMechbay onExit={onClose} commission={bay} preparationContext={context} />
      </div>
    </div>
  );
}

function PreparationContext({ catalog, state, mechId }: { catalog: Catalog; state: CampaignState; mechId: string | null }) {
  if (state.contract === null) return null;
  const plan = deploymentPlan(catalog, state, state.contract.missionId);
  return <div className="prep-refit-context">
    <div><strong>{catalog.missions.get(state.contract.missionId)?.name}</strong><span>{plan.tonnage}/{plan.allowance}t mission allowance · Save or return to continue preparation</span></div>
    <DeploymentStrip catalog={catalog} state={state} compact selected={plan.seats.findIndex((seat) => seat.mechId === mechId)} />
  </div>;
}
