import { useCallback, useRef } from 'react';
import type { Catalog } from '../../schema/load';
import { deploymentCandidates, deploymentPlan } from '../../campaign/deployment';
import { chooseDeployment } from '../../campaign/lancePresets';
import { employerNameFor } from '../../campaign/employers';
import { assign } from '../../campaign/roster';
import type { CampaignState } from '../../campaign/types';
import { ContractBriefing } from './ContractBriefing';
import { useDialogFocus } from '../useDialogFocus';
import { PreparationSteps } from './MachineIdentity';
import { LanceCard } from './LanceCard';
import { LancePresets } from './LancePresets';
import './lanceSelection.css';

interface Props {
  catalog: Catalog;
  state: CampaignState;
  mutate: (change: (draft: CampaignState) => void, message?: string) => void;
  onLaunch: () => void;
  onCancel: () => void;
  onRefit: (mechId: string) => void;
}

export function LanceManifest({ catalog, state, mutate, onLaunch, onCancel, onRefit }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const close = useCallback(() => cancelRef.current(), []);
  useDialogFocus(dialogRef, dialogRef, close);
  const contract = state.contract;
  if (contract === null) return null;
  const plan = deploymentPlan(catalog, state, contract.missionId);
  const candidates = deploymentCandidates(state);
  const mission = catalog.missions.get(contract.missionId);
  const employer = employerNameFor(catalog, state.campaignId, contract.employerId, contract.employerName);
  const reserves = state.pilots.filter((pilot) => !pilot.dead && !plan.pilotIds.includes(pilot.id));
  const card = (id: string, aboard: boolean, position: number) => {
    const pilot = state.pilots.find((entry) => entry.id === id);
    if (pilot === undefined) return <li key={id} className="lance-card unfit">Missing pilot · replace this seat
      <button type="button" onClick={() => mutate((draft) => chooseDeployment(draft, plan.pilotIds.filter((entry) => entry !== id)))}>Remove seat</button>
    </li>;
    const mech = candidates.find((pair) => pair.pilot.id === id)?.mech
      ?? state.mechs.find((entry) => entry.id === pilot.mechId) ?? null;
    const trial = deploymentPlan(catalog, { ...state, deploymentSelection: [...plan.pilotIds, id] }, contract.missionId);
    const refusal = aboard ? null : trial.issues[0] ?? null;
    return <LanceCard key={id} catalog={catalog} state={state} pilot={pilot} mech={mech}
      aboard={aboard} position={position} refusal={refusal} onRefit={onRefit}
      onToggle={() => mutate((draft) => chooseDeployment(draft,
        aboard ? plan.pilotIds.filter((entry) => entry !== id) : [...plan.pilotIds, id]))}
      onSeat={(mechId) => mutate((draft) => {
        chooseDeployment(draft, plan.pilotIds);
        assign(draft, id, mechId === '' ? null : mechId);
      })} />;
  };
  return <div className="manifest-backdrop" data-testid="lance-manifest">
    <section className="manifest exp-prep exp-drop-manifest" ref={dialogRef} role="dialog"
      aria-modal="true" aria-labelledby="manifest-title" tabIndex={-1}>
      <header><PreparationSteps stage="manifest" /><h3 id="manifest-title">Choose the drop</h3>
        <p>{mission?.name ?? contract.missionId} — {employer}.</p>
        <dl className="manifest-profile" data-testid="manifest-profile">
          <div><dt>Machines aboard</dt><dd>{plan.pilotIds.length}/{plan.slots}</dd></div>
          <div className={plan.tonnage > plan.allowance ? 'over' : undefined}><dt>Tonnage</dt>
            <dd data-testid="manifest-tonnage">{plan.tonnage}/{plan.allowance}t</dd></div>
          <div><dt>Reserve crew</dt><dd>{reserves.length}</dd></div>
        </dl>
        <div className="exp-drop-weight" role="progressbar" aria-label="Deployment tonnage"
          aria-valuemin={0} aria-valuemax={plan.allowance} aria-valuenow={Math.min(plan.tonnage, plan.allowance)}>
          <span style={{ width: `${plan.allowance > 0 ? Math.min(100, plan.tonnage / plan.allowance * 100) : 0}%` }} />
        </div>
        <p>{Math.max(0, plan.allowance - plan.tonnage)}t remaining. Every seat is your choice; mission limits apply to saved lances too.</p>
        <details className="exp-prep-contract"><summary>Mission orders &amp; signed terms</summary>
          <ContractBriefing catalog={catalog} state={state} missionId={contract.missionId}
            deadlineDay={contract.deadlineDay} nodeId={contract.nodeId} terms={contract} />
        </details>
      </header>
      <LancePresets catalog={catalog} state={state} missionId={contract.missionId} mutate={mutate} />
      {plan.issues.length === 0 ? null : <div className="lance-issues" role="status" data-testid="manifest-issues">
        <strong>Before launch</strong><ul>{plan.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
      </div>}
      <section aria-label="Machines deploying" data-testid="manifest-actual-drop">
        <h4>Aboard · {plan.pilotIds.length}</h4>
        {plan.pilotIds.length === 0 ? <p>No machines aboard. Choose a reserve below or use Autofill.</p> : null}
        <ul className="manifest-list lance-card-grid">{plan.pilotIds.map((id, index) => card(id, true, index))}</ul>
      </section>
      <section aria-label="Reserve crew"><h4>Reserve · {reserves.length}</h4>
        {reserves.length === 0 ? <p>All active crew selected.</p> : null}
        <ul className="manifest-list lance-card-grid">{reserves.map((pilot) => card(pilot.id, false, -1))}</ul>
      </section>
      <footer className="manifest-actions">
        <button type="button" onClick={onLaunch} disabled={plan.issues.length > 0} data-testid="manifest-launch">Launch ({plan.pairs.length})</button>
        <button type="button" onClick={onCancel} data-testid="manifest-cancel">Back to the mechbay</button>
      </footer>
    </section>
  </div>;
}
