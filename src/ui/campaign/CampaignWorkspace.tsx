import { useState, type ReactNode } from 'react';
import type { CampaignState } from '../../campaign/types';
import { defaultDropBerths, missionSlots } from '../../campaign/campaign';
import { deploymentCandidates } from '../../campaign/deployment';
import { dailyPayroll } from '../../campaign/ledger';
import type { Catalog } from '../../schema/load';
import { CompanyJournal } from './CompanyJournal';
import { cbills } from './Panels';
import './campaignWorkspace.css';
import type { CompanyArea } from './campaignNavigation';

const AREAS = [
  { id: 'operations', label: 'Operations', detail: 'Contracts & route' },
  { id: 'workshop', label: 'Workshop', detail: 'Machines & repairs' },
  { id: 'crew', label: 'Crew', detail: 'Pilots & progression' },
  { id: 'supplies', label: 'Stores & yard', detail: 'Parts & trade' },
  { id: 'journal', label: 'Journal', detail: 'Service & discoveries' },
] as const;
type WorkspaceContent = ReactNode | ((active: boolean) => ReactNode);

interface CampaignWorkspaceProps {
  catalog: Catalog;
  state: CampaignState;
  fullCompany: boolean;
  story?: ReactNode;
  route?: ReactNode;
  area?: CompanyArea;
  onAreaChange?: (area: CompanyArea) => void;
  operations: WorkspaceContent;
  workshop: WorkspaceContent;
  crew: ReactNode;
  supplies: ReactNode;
  journalNodeId?: string;
}

/** Navigation is transient. All financial and deployment decisions stay in campaign. */
export function CampaignWorkspace({
  catalog, state, fullCompany, story, route, operations, workshop, crew, supplies, area: controlledArea, onAreaChange, journalNodeId,
}: CampaignWorkspaceProps) {
  const [localArea, setLocalArea] = useState<CompanyArea>('operations');
  const area = controlledArea ?? localArea;
  const setArea = onAreaChange ?? setLocalArea;
  const selected = !fullCompany ? 'operations' : state.finished && area !== 'journal' ? 'operations' : area;
  const ready = deploymentCandidates(state).length;
  const completion = state.won ? 'Campaign complete'
    : state.log.some((entry) => entry.text.startsWith('The company retired.')) ? 'Company retired' : 'Campaign over';
  const faction = catalog.campaigns.get(state.campaignId)?.presentation?.faction ?? 'linewrought';
  return (
    <main className={`company-workspace company-workspace--${faction}${state.finished ? ' company-workspace--finished' : ''}`}
      data-campaign-faction={faction}>
      <div className="company-overview" aria-label="Company readiness">
        <span><strong>{ready}</strong> fieldable machines <small>of {state.mechs.length} owned</small></span>
        <span><strong>{state.pilots.filter((pilot) => !pilot.dead).length}</strong> crew <small>{cbills(dailyPayroll(catalog, state))} wages / day</small></span>
        <span className="company-contract-state"><i aria-hidden="true" />{state.finished ? completion : state.contract === null ? 'Available for contract' : 'Contract signed'}
          <small>{state.finished ? `Company record · day ${state.day}` : `${state.contract === null ? defaultDropBerths(catalog) : missionSlots(catalog, state.contract.missionId)} drop berths · mission tonnage applies`}</small></span>
      </div>
      {!fullCompany ? null : (
        <nav className="company-navigation" aria-label="Company work areas">
          {AREAS.filter((entry) => !state.finished || entry.id === 'operations' || entry.id === 'journal').map((entry, index) => (
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
      {selected === 'operations' ? story : null}
      {selected === 'operations' ? route : null}
      <div id="company-area-operations" className="company-area company-operations" hidden={selected !== 'operations'}>
        {typeof operations === 'function' ? operations(selected === 'operations') : operations}
      </div>
      <div id="company-area-workshop" className="company-area company-workshop" hidden={selected !== 'workshop'}>
        {fullCompany && !state.finished ? typeof workshop === 'function' ? workshop(selected === 'workshop') : workshop : null}
      </div>
      <div id="company-area-crew" className="company-area company-crew" hidden={selected !== 'crew'}>
        {fullCompany && !state.finished ? crew : null}
      </div>
      <div id="company-area-supplies" className="company-area company-supplies" hidden={selected !== 'supplies'}>
        {fullCompany && !state.finished ? supplies : null}
      </div>
      <div id="company-area-journal" className="company-area" hidden={selected !== 'journal'}>
        <CompanyJournal catalog={catalog} state={state} selectedNodeId={journalNodeId} />
      </div>
    </main>
  );
}
