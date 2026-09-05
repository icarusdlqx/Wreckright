import { useState, type ReactNode } from 'react';
import type { CampaignState } from '../../campaign/types';
import { deployableLance, DROP_BERTHS } from '../../campaign/campaign';
import { dailyPayroll } from '../../campaign/ledger';
import type { Catalog } from '../../schema/load';
import { cbills } from './Panels';
import './campaignWorkspace.css';

const AREAS = [
  { id: 'operations', label: 'Operations', detail: 'Contracts & route' },
  { id: 'workshop', label: 'Workshop', detail: 'Machines & repairs' },
  { id: 'crew', label: 'Crew', detail: 'Pilots & progression' },
  { id: 'supplies', label: 'Stores & yard', detail: 'Parts & trade' },
] as const;
type Area = (typeof AREAS)[number]['id'];

interface CampaignWorkspaceProps {
  catalog: Catalog;
  state: CampaignState;
  fullCompany: boolean;
  operations: ReactNode;
  workshop: ReactNode;
  crew: ReactNode;
  supplies: ReactNode;
}

/** Navigation is transient. All financial and deployment decisions stay in campaign. */
export function CampaignWorkspace({
  catalog, state, fullCompany, operations, workshop, crew, supplies,
}: CampaignWorkspaceProps) {
  const [area, setArea] = useState<Area>('operations');
  const selected = !fullCompany || state.finished ? 'operations' : area;
  const ready = deployableLance(state).length;
  return (
    <main className="company-workspace">
      <div className="company-overview" aria-label="Company readiness">
        <span><strong>{ready}</strong> fieldable machines <small>of {state.mechs.length} owned</small></span>
        <span><strong>{state.pilots.filter((pilot) => !pilot.dead).length}</strong> crew <small>{cbills(dailyPayroll(catalog, state))} wages / day</small></span>
        <span className="company-contract-state"><i aria-hidden="true" />{state.contract === null ? 'Available for contract' : 'Contract signed'}<small>{DROP_BERTHS} drop berths · mission tonnage applies</small></span>
      </div>
      {!fullCompany || state.finished ? null : (
        <nav className="company-navigation" aria-label="Company work areas">
          {AREAS.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              aria-current={selected === entry.id ? 'page' : undefined}
              aria-controls={`company-area-${entry.id}`}
              data-testid={`camp-area-${entry.id}`}
              onClick={() => setArea(entry.id)}
            >
              <span aria-hidden="true">0{index + 1}</span>
              <strong>{entry.label}</strong><small>{entry.detail}</small>
            </button>
          ))}
        </nav>
      )}
      <div id="company-area-operations" className="company-area company-operations" hidden={selected !== 'operations'}>
        {operations}
      </div>
      <div id="company-area-workshop" className="company-area company-workshop" hidden={selected !== 'workshop'}>
        {fullCompany && !state.finished ? workshop : null}
      </div>
      <div id="company-area-crew" className="company-area company-crew" hidden={selected !== 'crew'}>
        {fullCompany && !state.finished ? crew : null}
      </div>
      <div id="company-area-supplies" className="company-area company-supplies" hidden={selected !== 'supplies'}>
        {fullCompany && !state.finished ? supplies : null}
      </div>
    </main>
  );
}
