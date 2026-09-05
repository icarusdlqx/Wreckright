import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import type { CampaignState, MechRecord } from '../../campaign/types';
import type { RepairEstimate, RepairQueueEntry } from '../../campaign/repair';
import { payrollThrough } from '../../campaign/ledger';
import { machineDisplayName, designIdentityLabel } from '../designLabel';
import { ChassisSilhouette } from '../mechbay/ChassisSilhouette';
import { factionLabel } from './factionEconomy';
import './preparation.css';

export function MachineIdentity({ catalog, design }: { catalog: Catalog; design: Design }) {
  const chassis = catalog.chassis.get(design.chassisId);
  if (chassis === undefined) return <strong>{machineDisplayName(catalog, design)}</strong>;
  return (
    <div className="exp-machine-identity" data-faction={chassis.faction}
      role="group" aria-label={designIdentityLabel(catalog, design)}>
      <div className="exp-machine-portrait" aria-hidden="true">
        <ChassisSilhouette chassis={chassis} design={design} />
      </div>
      <div className="exp-machine-copy">
        <span className="exp-machine-culture">{factionLabel(chassis.faction)}</span>
        <strong>{machineDisplayName(catalog, design)}</strong>
        <span>{chassis.tonnage}t {chassis.class} · {chassis.role}</span>
      </div>
    </div>
  );
}

interface RepairReadoutProps {
  catalog: Catalog;
  state: CampaignState;
  mech: MechRecord;
  estimate: RepairEstimate;
  projected: Omit<RepairQueueEntry, 'mechId'>;
  booking: RepairQueueEntry | undefined;
  ready: boolean;
  status: string;
}

/** Keep the paid booking distinct from a quote for work not yet ordered. */
export function RepairReadout({ catalog, state, mech, estimate, projected, booking, ready, status }: RepairReadoutProps) {
  const booked = booking !== undefined;
  const needsWork = mech.status === 'hulk' || estimate.days > 0;
  const readyDay = booked ? mech.readyOnDay : needsWork ? projected.readyOnDay : state.day;
  const startsDay = booked ? booking.startsOnDay : projected.startsOnDay;
  const wages = payrollThrough(catalog, state, Math.max(0, readyDay - state.day));
  const badge = mech.status === 'hulk' ? 'Rebuild needed'
    : !ready ? booking?.status === 'active' ? 'On the lift'
      : booking?.status === 'inherited' ? 'Booked workshop work' : `In queue · ${booking?.queuePosition ?? 1}`
    : mech.design.mounts.length === 0 ? 'Needs a weapon'
    : needsWork ? 'Fieldable · damaged' : 'Machine ready';
  const late = state.contract !== null && readyDay > state.contract.deadlineDay;
  return (
    <div className="exp-repair-readout" role="group" aria-label={status}>
      <span className={`exp-readiness ${ready && mech.design.mounts.length > 0 ? 'is-ready' : 'needs-attention'}`}>{badge}</span>
      {booked || needsWork ? (
        <>
          <dl className="exp-repair-facts">
            <div><dt>{booked ? 'Booking' : 'Pay now'}</dt><dd>{booked ? 'Paid' : `${Math.round(estimate.cost).toLocaleString('en-GB')} C`}</dd></div>
            <div><dt>Starts</dt><dd>{startsDay === null ? 'Existing booking' : `Day ${startsDay}`}</dd></div>
            <div><dt>Ready</dt><dd className={late ? 'is-late' : undefined}>Day {readyDay}</dd></div>
          </dl>
          <p className="exp-repair-wages">Company payroll until ready: <strong>{Math.round(wages).toLocaleString('en-GB')} C</strong>. Charged as days pass.</p>
          {late ? <p className="exp-prep-warning">Ready after the signed deadline, day {state.contract?.deadlineDay}.</p> : null}
        </>
      ) : <p className="exp-repair-wages">{mech.design.mounts.length === 0 ? 'Fit a weapon before deployment.' : 'No workshop booking required.'}</p>}
    </div>
  );
}

export function PreparationSteps({ stage }: { stage: 'bay' | 'manifest' }) {
  return (
    <ol className="exp-prep-steps" aria-label="Drop preparation">
      <li aria-current={stage === 'bay' ? 'step' : undefined}><span>01</span> Check machines</li>
      <li aria-current={stage === 'manifest' ? 'step' : undefined}><span>02</span> Assemble the drop</li>
      <li><span>03</span> Field briefing</li>
    </ol>
  );
}
