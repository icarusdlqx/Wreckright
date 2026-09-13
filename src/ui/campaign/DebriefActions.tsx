import type { Catalog } from '../../schema/load';
import { pendingTraitPicks } from '../../campaign/roster';
import { estimateRepair } from '../../campaign/repair';
import { isPilotAvailable, type CampaignState, type MissionOutcome } from '../../campaign/types';
import { readyToTrain } from '../pilotProgression';
import { authoredDesignName } from '../designLabel';
import type { CampaignNavigationTarget } from './campaignNavigation';
import './debriefActions.css';

interface Props {
  catalog: Catalog;
  state: CampaignState;
  outcome: MissionOutcome;
  onAction: (target: CampaignNavigationTarget) => void;
}
const credits = (value: number): string => `${Math.round(value).toLocaleString('en-GB')} C`;

export function DebriefActions({ catalog, state, outcome, onAction }: Props) {
  const damaged = state.mechs.map((mech) => ({ mech, estimate: estimateRepair(catalog, mech) }))
    .filter(({ mech, estimate }) => mech.status === 'hulk' || mech.status === 'repairing' || estimate.days > 0);
  const trained = state.pilots.filter((pilot) => !pilot.dead
    && (readyToTrain(catalog, pilot) || pendingTraitPicks(catalog, pilot) > 0));
  const wounded = state.pilots.filter((pilot) => !pilot.dead && !isPilotAvailable(state, pilot));
  const lost = outcome.pilotReports.filter((report) => report.fate === 'killed');
  const parts = outcome.salvagedItems.reduce((total, item) => total + item.count, 0);
  const hulls = outcome.salvagedChassis.length;
  const grantParts = (outcome.campaignRewards ?? []).flatMap((reward) => reward.items).reduce((total, item) => total + item.count, 0);
  return <section className="debrief-next" aria-label="Company next steps" data-testid="debrief-next-steps">
    <h4>Back at the company</h4>
    <p>Opening a record closes this report and keeps your salvage choices. Repairs and training remain your decision.</p>
    <div className="debrief-next-grid">
      <section><h5>Workshop · {damaged.length} need attention</h5>
        {damaged.length === 0 ? <p>Machines returned ready for another drop.</p> : <ul>{damaged.map(({ mech, estimate }) => {
          const booked = mech.status === 'repairing';
          return <li key={mech.id}><strong>{authoredDesignName(catalog, mech.design)}</strong>
            <small>{booked ? 'Already booked and paid' : `${credits(estimate.cost)} ${mech.status === 'hulk' ? 'rebuild' : 'repair'} estimate`} · ready immediately</small>

            <button type="button" data-testid={`debrief-workshop-${mech.id}`} onClick={() => onAction({ area: 'workshop', mechId: mech.id })}>Inspect {mech.status === 'hulk' ? 'rebuild' : 'repairs'}</button>
          </li>;
        })}</ul>}
      </section>
      <section><h5>Crew · {trained.length} ready to train</h5>
        {trained.length === 0 ? <p>Crew are building experience toward their next skill.</p> : <ul>{trained.map((pilot) => <li key={pilot.id}>
          <strong>{pilot.name}</strong><small>{pilot.xp - pilot.spentXp} XP banked{pendingTraitPicks(catalog, pilot) > 0 ? ' · speciality available' : ''}</small>
          <button type="button" data-testid={`debrief-train-${pilot.id}`} onClick={() => onAction({ area: 'crew', pilotId: pilot.id })}>Choose training</button>
        </li>)}</ul>}
        {wounded.length === 0 ? null : <ul>{wounded.map((pilot) => <li key={pilot.id}><strong>{pilot.name}</strong>
          <small>{(pilot.recoveryMissions ?? 0) > 0 ? 'Wounded · misses next mission' : `Wounded until day ${pilot.injuredUntilDay}`}</small>
          <button type="button" data-testid={`debrief-wounded-${pilot.id}`} onClick={() => onAction({ area: 'crew', pilotId: pilot.id })}>Review crew record</button>
        </li>)}</ul>}
        {wounded.length + lost.length === 0 ? null : <button type="button" data-testid="debrief-hire" onClick={() => onAction({ area: 'crew', hiring: true })}>Find a replacement pilot</button>}
      </section>
      <section><h5>Salvage · {parts} parts · {hulls} hulls</h5>
        <p>{parts + hulls === 0 ? 'No salvage came home from this field.' : 'Loose parts are in Stores. Recovered hulls arrive stripped and damaged in the Workshop.'}</p>
        {grantParts === 0 ? null : <p>Plus {grantParts} part{grantParts === 1 ? '' : 's'} delivered as guaranteed contract rewards.</p>}
        <button type="button" data-testid="debrief-stores" onClick={() => onAction({ area: 'supplies' })}>Open stores &amp; yard</button>
      </section>
    </div>
  </section>;
}
