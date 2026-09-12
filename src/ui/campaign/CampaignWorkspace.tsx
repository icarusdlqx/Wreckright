import { useState, type ReactNode } from 'react';
import type { CampaignState } from '../../campaign/types';
import { defaultDropBerths, missionSlots } from '../../campaign/campaign';
import { deploymentCandidates } from '../../campaign/deployment';
import type { Catalog } from '../../schema/load';
import { CompanyJournal } from './CompanyJournal';
import './campaignWorkspace.css';
import './simpleCampaign.css';
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
      <div className="campaign-journey" data-testid="campaign-journey" aria-label="Campaign mission flow">
        <strong>1 · Choose mission</strong><span>2 · Repair & customise</span><span>3 · Pair pilots & deploy</span>
      </div>
      {!fullCompany ? null : <details className="company-tools" open={selected !== 'operations' || undefined}>
        <summary>Company records & supplies</summary>
        <p>{ready} fieldable machines · {state.pilots.filter((pilot) => !pilot.dead).length} pilots
          {' · '}{state.contract === null && !state.finished ? 'Available for contract · ' : ''}{state.finished ? completion : `${state.contract === null ? defaultDropBerths(catalog) : missionSlots(catalog, state.contract.missionId)} deployment berths`}</p>
        <nav aria-label="Company tools">{AREAS.filter((entry) => !state.finished || entry.id === 'operations' || entry.id === 'journal').map((entry) =>
          <button key={entry.id} type="button" data-testid={`camp-area-${entry.id}`} aria-current={selected === entry.id ? 'page' : undefined}
            onClick={() => setArea(entry.id)}>{entry.id === 'operations' ? 'Return to missions' : entry.label}</button>)}</nav>
      </details>}
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
