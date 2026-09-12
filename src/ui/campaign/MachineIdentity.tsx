import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import type { CampaignState, MechRecord } from '../../campaign/types';
import type { RepairEstimate, RepairQueueEntry } from '../../campaign/repair';
import { machineDisplayName, designIdentityLabel } from '../designLabel';
import { MachinePortrait } from '../mechbay/MachinePortrait';
import { factionLabel } from './factionEconomy';
import './preparation.css';

export function MachineIdentity({ catalog, design, companyLabel }: { catalog: Catalog; design: Design; companyLabel?: string }) {
  const chassis = catalog.chassis.get(design.chassisId);
  if (chassis === undefined) return <strong>{companyLabel ?? machineDisplayName(catalog, design)}</strong>;
  return (
    <div className="exp-machine-identity" data-faction={chassis.faction}
      role="group" aria-label={designIdentityLabel(catalog, design)}>
      <div className="exp-machine-portrait" aria-hidden="true">
        <MachinePortrait chassis={chassis} />
      </div>
      <div className="exp-machine-copy">
        <span className="exp-machine-culture">{factionLabel(chassis.faction)}</span>
        <strong>{companyLabel ?? machineDisplayName(catalog, design)}</strong>
        <span>{catalog.designs.has(design.id) ? "Prime variant" : design.name} · {chassis.tonnage}t {chassis.class} · {chassis.role}</span>
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
export function RepairReadout({ mech, estimate, ready, status }: RepairReadoutProps) {
  const needsWork = mech.status === 'hulk' || estimate.days > 0;
  return <div className="exp-repair-readout" role="group" aria-label={status}>
    <span className={`exp-readiness ${ready ? 'is-ready' : 'needs-attention'}`}>{mech.status === 'hulk' ? 'Rebuild needed' : needsWork ? 'Fieldable · damaged' : 'Machine ready'}</span>
    {needsWork ? <p>Full restoration: <strong>{estimate.cost.toLocaleString('en-GB')} C</strong>. Ready immediately after payment.</p>
      : <p>No repairs required.</p>}
  </div>;
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
