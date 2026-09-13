import type { Catalog } from '../../schema/load';
import { mechIntegrity } from '../../campaign/integrity';
import { estimateRepair } from '../../campaign/repair';
import { availableXp, pendingTraitPicks } from '../../campaign/roster';
import { isPilotAvailable, type CampaignState, type MissionOutcome, type PilotReport } from '../../campaign/types';
import { PilotPortrait } from '../PilotPortrait';
import { MachinePortrait } from '../mechbay/MachinePortrait';
import { stripSerialDesignation } from '../designLabel';
import { readyToTrain } from '../pilotProgression';
import type { CampaignNavigationTarget } from './campaignNavigation';
import './debriefCrew.css';

interface Props {
  catalog: Catalog;
  state: CampaignState;
  outcome: MissionOutcome;
  onAction?: (target: CampaignNavigationTarget) => void;
}

/** Names alone cannot identify one of two identical company machines. */
export function reportedMachine(state: CampaignState, report: PilotReport) {
  return report.mechId === undefined ? undefined : state.mechs.find((mech) => mech.id === report.mechId);
}

function CrewReportCard({ catalog, state, report, onAction }: Omit<Props, 'outcome'> & { report: PilotReport }) {
  const pilot = state.pilots.find((entry) => entry.id === report.pilotId);
  const mech = reportedMachine(state, report);
  const chassis = catalog.chassis.get(report.chassisId ?? mech?.design.chassisId ?? '');
  const integrity = mech === undefined ? null : mechIntegrity(catalog, mech);
  const repair = mech === undefined ? null : estimateRepair(catalog, mech);
  const canTrain = pilot !== undefined && !pilot.dead && report.fate !== 'killed'
    && (readyToTrain(catalog, pilot) || pendingTraitPicks(catalog, pilot) > 0);
  const needsRepair = mech !== undefined && (mech.status !== 'ready' || (repair?.days ?? 0) > 0);
  const wounded = report.fate === 'injured' && pilot !== undefined && !isPilotAvailable(state, pilot);
  const fate = report.fate === 'killed' ? 'Killed in action'
    : wounded && (pilot.recoveryMissions ?? 0) > 0 ? 'Wounded · misses next mission'
      : report.fate === 'injured' ? 'Returned wounded' : 'Returned';
  return <li className={`debrief-crew-card is-${report.fate}`} data-testid={`debrief-${report.pilotId}`}>
    <div className="debrief-pair-identity">
      <PilotPortrait pilot={pilot ?? { id: report.pilotId, name: report.name }} />
      <div><span className={`debrief-fate ${report.fate}`} data-testid={`debrief-fate-${report.pilotId}`}>{fate}</span>
        <h4>{report.name}</h4><p>{stripSerialDesignation(report.mech)}</p>
        {chassis === undefined ? null : <small>{chassis.tonnage}t · {chassis.role}</small>}
      </div>
      {chassis === undefined ? null : <div className="debrief-pair-machine"><MachinePortrait chassis={chassis} /></div>}
    </div>
    <div className="debrief-crew-earned"><strong>+{report.xp} XP</strong>
      <span>{report.xpBanked === null ? 'Mission experience' : `${report.xpBanked} banked after mission`}</span>
      <small>{report.kills} kill{report.kills === 1 ? '' : 's'} · {report.damage} damage</small>
    </div>
    {(report.sharedXp ?? 0) <= 0 ? null : <p className="debrief-shared-xp">Includes {report.sharedXp} XP for shared mission progress.</p>}
    {report.promotions.length === 0 ? null : <p className="debrief-record-note">Training recorded: {report.promotions.join(', ')}</p>}
    <div className="debrief-pair-condition">
      {mech === undefined || integrity === null ? <span>{report.mechId === undefined ? 'Field machine recorded above; condition is in the Workshop.' : 'This machine is no longer in the company.'}</span> : <>
        <span>Current machine condition <strong>{Math.round(integrity.fraction * 100)}% intact</strong></span>
        <div role="progressbar" aria-label={`${stripSerialDesignation(report.mech)} integrity`} aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(integrity.fraction * 100)}><i style={{ width: `${integrity.fraction * 100}%` }} /></div>
        <small>{mech.status === 'hulk' ? 'Recovered wreck · rebuilding needed'
          : mech.status === 'repairing' ? `Workshop booked · ready day ${mech.readyOnDay}`
            : needsRepair ? 'Fieldable with damage · inspect repairs' : 'Ready for the next deployment'}</small>
        {repair === null || !needsRepair || mech.status === 'repairing' ? null : <small>
          {Math.round(repair.cost).toLocaleString('en-GB')} C {mech.status === 'hulk' ? 'rebuild' : 'repair'} estimate · ready immediately
        </small>}
      </>}
    </div>
    {report.serviceNotes?.length ? <details className="debrief-service-notes"><summary>Field record</summary>
      {report.serviceNotes.map((note) => <p key={note}>{note}</p>)}</details> : null}
    {onAction === undefined || state.finished ? null : <div className="debrief-pair-actions">
      {pilot === undefined || report.fate === 'killed' || pilot.dead ? <span className="debrief-record-note">Record closed</span>
        : <button type="button" data-testid={`debrief-pair-train-${report.pilotId}`} onClick={() => onAction({ area: 'crew', pilotId: pilot.id })}>
          {canTrain ? `Choose training · ${availableXp(pilot)} XP` : wounded ? 'Review recovery' : 'Open pilot record'}</button>}
      {mech === undefined ? null : <button type="button" data-testid={`debrief-pair-workshop-${mech.id}`}
        onClick={() => onAction({ area: 'workshop', mechId: mech.id })}>{needsRepair ? 'Inspect repairs' : 'Inspect machine'}</button>}
    </div>}
  </li>;
}

export function DebriefCrew({ catalog, state, outcome, onAction }: Props) {
  const count = (fate: PilotReport['fate']): number => outcome.pilotReports.filter((report) => report.fate === fate).length;
  return <section className="debrief-crew" aria-labelledby="debrief-crew-title" data-testid="debrief-crew">
    <header><h4 id="debrief-crew-title">Your crew, back from the field</h4>
      <p><span>{count('returned')} returned</span><span>{count('injured')} wounded</span><span>{count('killed')} killed in action</span></p></header>
    {outcome.pilotReports.length === 0 ? <p>No crew records for this drop.</p> : <ul>
      {outcome.pilotReports.map((report) => <CrewReportCard key={report.pilotId} catalog={catalog} state={state} report={report}
        {...(onAction === undefined ? {} : { onAction })} />)}
    </ul>}
  </section>;
}
