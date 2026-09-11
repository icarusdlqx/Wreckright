import { useCallback, useMemo, useRef, useState } from 'react';
import type { Catalog } from '../../schema/load';
import { deploymentPlan } from '../../campaign/deployment';
import { putPilotInSeat } from '../../campaign/deploymentSeats';
import { autoFillDeployment } from '../../campaign/lancePresets';
import { isPilotAvailable, type CampaignState } from '../../campaign/types';
import { PilotStats } from '../PilotStats';
import { PilotProfile } from '../PilotProfile';
import { PilotPortrait } from '../PilotPortrait';
import { PilotAbilityReadout } from '../PilotAbilityReadout';
import { useDialogFocus } from '../useDialogFocus';
import { DeploymentStrip } from './DeploymentStrip';
import { PreparationRoster } from './PreparationRoster';
import { PreparationMachine } from './PreparationMachine';
import { LancePresets } from './LancePresets';
import { ContractBriefing } from './ContractBriefing';
import { PlanningMap } from './PlanningMap';
import { missionPreviewData } from './missionPreviewData';
import { clearPreparationSeat, selectPreparationMech } from './preparationModel';
import type { CampaignChange } from './campaignSession';
import './preparationWorkspace.css';

interface Props {
  catalog: Catalog;
  state: CampaignState;
  mutate: (change: CampaignChange, message?: string) => void;
  onLaunch: () => void;
  onCancel: () => void;
  onRefit: (mechId: string) => void;
  onView?: (view: 'machines' | 'pilots' | 'briefing') => void;
  hidden?: boolean;
  persistent?: boolean;
}

export function LanceManifest({ catalog, state, mutate, onLaunch, onCancel, onRefit, onView, hidden = false, persistent = true }: Props) {
  const [view, setView] = useState<'machines' | 'pilots' | 'briefing'>('machines');
  const [selected, setSelected] = useState(0);
  const [inspectedMech, setInspectedMech] = useState<string | null>(null);
  const [inspectedPilot, setInspectedPilot] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const close = useCallback(() => cancelRef.current(), []);
  useDialogFocus(dialogRef, dialogRef, hidden ? undefined : close);
  const contract = state.contract;
  const survey = useMemo(() => missionPreviewData(catalog, contract?.missionId ?? null), [catalog, contract?.missionId]);
  if (contract === null) return null;
  const plan = deploymentPlan(catalog, state, contract.missionId);
  const seat = plan.seats[selected] ?? { mechId: null, pilotId: null };
  const mech = state.mechs.find((entry) => entry.id === (inspectedMech ?? seat.mechId));
  const pilot = state.pilots.find((entry) => entry.id === (inspectedPilot ?? seat.pilotId));
  const occupant = state.pilots.find((entry) => entry.id === seat.pilotId);
  const priorSeat = plan.seats.findIndex((entry) => entry.pilotId === pilot?.id);
  const machineAboard = plan.seats.findIndex((entry) => entry.mechId === mech?.id);
  const occupied = plan.seats.filter((entry) => entry.mechId !== null || entry.pilotId !== null).length;
  const change = (update: CampaignChange): void => mutate((draft) => {
    const message = update(draft);
    setNotice(message ?? 'Preparation updated.');
    return message;
  });
  const show = (next: typeof view): void => { setView(next); setNotice(null); onView?.(next); };
  const select = (index: number): void => { setSelected(index); setInspectedMech(null); setInspectedPilot(null); setNotice(null); };
  const refit = (id: string): void => { setNotice(null); onRefit(id); };
  const assignPilot = (index: number, id: string): void => {
    const candidate = state.pilots.find((entry) => entry.id === id);
    if (candidate === undefined || !isPilotAvailable(state, candidate)) { setNotice('That pilot is unavailable for this mission.'); return; }
    if (plan.seats[index]?.mechId == null) { select(index); show('machines'); setNotice('Choose a machine for this berth before assigning its pilot.'); return; }
    change((draft) => putPilotInSeat(draft, index, id));
    setSelected(index); setInspectedPilot(id);
  };

  return <div className="manifest-backdrop prep-workspace-backdrop" data-testid="lance-manifest" hidden={hidden} inert={hidden}>
    <section className="manifest exp-prep prep-workspace" ref={dialogRef} role="dialog" aria-modal="true"
      aria-labelledby="manifest-title" tabIndex={-1}>
      <header className="prep-header">
        <div><span className="prep-eyebrow">{catalog.campaigns.get(state.campaignId)?.name ?? 'Company preparation'}</span>
          <h3 id="manifest-title">Prepare the team</h3><p>{catalog.missions.get(contract.missionId)?.name ?? contract.missionId}</p></div>
        <div className="prep-mission-totals" data-testid="manifest-profile">
          <strong className={plan.tonnage > plan.allowance ? 'is-over' : ''} data-testid="manifest-tonnage">{plan.tonnage}/{plan.allowance}t</strong>
          <span>Mission tonnage · {occupied}/{plan.slots} machines · {plan.pairs.length} ready</span>
          <small>Chassis weight counts towards the drop allowance.</small>
        </div>
        <button type="button" className="prep-close" onClick={onCancel} aria-label="Close preparation">×</button>
      </header>
      <DeploymentStrip catalog={catalog} state={state} selected={selected} onSelect={select} onDropPilot={assignPilot} />
      <nav className="prep-view-tabs" aria-label="Preparation views">
        <button type="button" aria-pressed={view === 'machines'} onClick={() => show('machines')} data-testid="prep-machines">Machines &amp; loadouts</button>
        <button type="button" aria-pressed={view === 'pilots'} onClick={() => show('pilots')} data-testid="hangar-continue">Pilots &amp; drop</button>
        <button type="button" aria-pressed={view === 'briefing'} onClick={() => show('briefing')} data-testid="prep-briefing">Mission map &amp; orders</button>
        <details className="prep-presets"><summary>Saved lances</summary>
          <LancePresets catalog={catalog} state={state} missionId={contract.missionId} mutate={change} />
        </details>
      </nav>
      <div className="prep-content" data-testid={view === 'machines' ? 'hangar-stage' : 'prep-team-view'}>
        {view === 'briefing' ? <div className="prep-briefing-grid">
          {survey === null ? null : <PlanningMap data={survey} />}
          <ContractBriefing catalog={catalog} state={state} missionId={contract.missionId}
            deadlineDay={contract.deadlineDay} nodeId={contract.nodeId} terms={contract} />
        </div> : <div className="prep-selection-grid">
          <PreparationRoster catalog={catalog} state={state} view={view} mechId={mech?.id ?? null} pilotId={pilot?.id ?? null}
            onMech={setInspectedMech} onPilot={setInspectedPilot} />
          <main className="prep-main-inspector">
            {view === 'machines' ? mech === undefined ? <div className="prep-empty-detail"><h4>Choose a machine</h4><p>Select one from the company roster, then place it in seat {selected + 1}.</p></div>
              : <PreparationMachine catalog={catalog} state={state} mech={mech} mutate={change} onRefit={refit} />
              : pilot === undefined ? <div className="prep-empty-detail"><h4>Choose a pilot</h4><p>Select a portrait to compare skills and assign the cockpit.</p></div>
                : <section className="prep-pilot-detail"><PilotProfile pilot={pilot} prominent /><PilotStats catalog={catalog} pilot={pilot} />
                  <PilotAbilityReadout catalog={catalog} pilot={pilot} />
                  <p className="prep-service">{pilot.xp - pilot.spentXp} XP available for training in Crew.</p></section>}
          </main>
          <aside className="prep-seat-inspector">
            <h4>Deployment seat {selected + 1}</h4>
            {view === 'machines' ? <>
              {occupant === undefined ? <p className="prep-warning">Needs a pilot</p> : <><div className="prep-paired-pilot"><PilotPortrait pilot={occupant} /><strong>{occupant.name}</strong></div>
                <PilotStats catalog={catalog} pilot={occupant} compact /><PilotAbilityReadout catalog={catalog} pilot={occupant} compact /></>}
              {mech === undefined ? null : machineAboard === selected ? <p>This machine is in the selected berth.</p>
                : machineAboard >= 0 ? <p>This machine is already in seat {machineAboard + 1}. Select that seat to change its pilot.</p>
                  : <><p>{seat.mechId === null ? 'Add this machine to the selected berth.' : 'Replace this berth’s machine. Its pilot stays in the seat.'}</p>
                    <button type="button" className="prep-primary" data-testid="prep-assign-machine" onClick={() => change((draft) => selectPreparationMech(catalog, draft, selected, mech.id))}>Put machine in seat {selected + 1}</button></>}
              <button type="button" onClick={() => { setInspectedPilot(null); show('pilots'); }} data-testid="prep-choose-pilot">Choose pilot</button>
            </> : <>
              <strong>{state.mechs.find((entry) => entry.id === seat.mechId)?.design.name ?? 'No machine selected'}</strong>
              <p>{occupant?.name ?? 'No pilot'} currently assigned.</p>
              {pilot === undefined ? null : <>
                <p className="prep-assignment-preview" data-testid="prep-assignment-preview">
                  {pilot.id === seat.pilotId ? 'This pilot and machine are paired.' : <>
                    {priorSeat >= 0 ? `Seat ${priorSeat + 1} will need a replacement pilot. ` : ''}
                    {occupant === undefined ? 'Fills the selected cockpit.' : `${occupant.name} returns to reserves.`}
                  </>}
                </p>
                <button type="button" className="prep-primary" data-testid="prep-assign-pilot" disabled={seat.mechId === null || pilot.id === seat.pilotId || !isPilotAvailable(state, pilot)}
                  title={seat.mechId === null ? 'Choose a machine for this seat first.' : !isPilotAvailable(state, pilot) ? 'This pilot must miss the next mission.' : pilot.id === seat.pilotId ? 'This pilot is already assigned.' : `Assign ${pilot.name} to seat ${selected + 1}.`}
                  onClick={() => assignPilot(selected, pilot.id)}>{pilot.id === seat.pilotId ? 'Pilot assigned' : `Assign ${pilot.name}`}</button>
                {!isPilotAvailable(state, pilot) ? <p className="prep-warning">Injured pilots miss the next mission.</p> : null}
              </>}
              {seat.pilotId === null ? null : <button type="button" data-testid={`manifest-bench-${seat.pilotId}`}
                onClick={() => change((draft) => clearPreparationSeat(draft, selected, true))}>Return pilot to reserves</button>}
              {seat.mechId === null ? null : <button type="button" data-testid={`manifest-refit-${seat.pilotId ?? 'empty'}`}
                disabled={state.mechs.find((entry) => entry.id === seat.mechId)?.status !== 'ready'}
                title={state.mechs.find((entry) => entry.id === seat.mechId)?.status !== 'ready' ? 'Only a ready machine can enter the refit bay.' : 'Open this machine in the refit bay.'}
                onClick={() => { if (seat.mechId !== null) refit(seat.mechId); }}>Refit assigned machine</button>}
            </>}
            {seat.mechId === null && seat.pilotId === null ? null : <button type="button" data-testid="prep-remove-seat" onClick={() => change((draft) => clearPreparationSeat(draft, selected))}>Remove from deployment</button>}
          </aside>
        </div>}
      </div>
      <footer className="manifest-actions prep-actions">
        <div className="prep-feedback" role="status" data-testid="prep-feedback">
          {notice === null ? null : <span>{notice}</span>}
          {!persistent ? <strong className="prep-warning">Changes are memory-only. Return to the company to recover saving.</strong> : null}
          {plan.issues.length === 0 ? <strong>{persistent ? 'Team ready · preparation saved' : 'Team ready · save required before deployment'}</strong> : <details data-testid="manifest-issues"><summary id="manifest-issue-summary">{plan.issues[0]}{plan.issues.length > 1 ? ` (+${plan.issues.length - 1})` : ''}</summary><ul>{plan.issues.map((issue, index) => <li key={`${index}:${issue}`}>{issue}</li>)}</ul></details>}
        </div>
        <button type="button" onClick={() => change((draft) => { autoFillDeployment(catalog, draft, contract.missionId); return 'Available pilots and machines selected within the mission allowance.'; })} data-testid="prep-autofill">Autofill</button>
        <button type="button" onClick={onCancel} data-testid="manifest-cancel">Back to company</button>
        <button type="button" className="prep-primary" onClick={onLaunch} disabled={plan.issues.length > 0}
          aria-describedby={plan.issues.length > 0 ? 'manifest-issue-summary' : undefined}
          title={plan.issues.length > 0 ? plan.issues.join(' ') : 'Review the mission map and final orders.'}
          data-testid="manifest-launch">Review field briefing →</button>
      </footer>
    </section>
  </div>;
}
