import type { CampaignState, MechRecord } from '../../campaign/types';
import type { Catalog } from '../../schema/load';
import { machineDisplayName, stripSerialDesignation } from '../designLabel';
import { machineServiceHistory } from './serviceRecord';
import './machineServiceRecord.css';

export function MachineServiceRecord({ catalog, state, mech }: {
  catalog: Catalog; state: CampaignState; mech: MechRecord;
}) {
  const record = machineServiceHistory(catalog, state, mech);
  const currentName = machineDisplayName(catalog, mech.design);
  return <details className="machine-service-record" data-testid={`machine-service-${mech.id}`} key={mech.id}>
    <summary>Service record <span>{record.deployments > 0
      ? `${record.deployments} recorded deployment${record.deployments === 1 ? '' : 's'}` : 'No linked deployments yet'}</span></summary>
    <div>
      {record.last === null ? <p>This machine has no linked field report yet.</p> : <>
        <p><strong>Last deployment: {record.last.mission}</strong><br />
          {record.last.pilot} · {record.last.won ? 'Contract completed' : 'Contract not completed'}</p>
        {record.last.machine === currentName || record.last.machine === stripSerialDesignation(mech.design.name)
          ? null : <p>Deployed as <strong>{record.last.machine}</strong>.</p>}
        {record.last.weaponsChanged ? <p>Weapons changed since that deployment.</p> : null}
      </>}
      {record.acquisition === null ? null : <p><strong>Acquisition: {record.acquisition.mission}</strong><br />{record.acquisition.label}</p>}
      {record.incomplete ? <small>Older or archived reports may not identify individual machines.</small> : null}
    </div>
  </details>;
}
