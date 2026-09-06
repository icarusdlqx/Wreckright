import { useEffect, useRef, useState } from 'react';
import { dailyPayroll } from '../../campaign/ledger';
import { availableHires, availableXp, pendingTraitPicks } from '../../campaign/roster';
import { isPilotAvailable, type CampaignState, type PilotRecord } from '../../campaign/types';
import { getCatalog } from '../../schema/load';
import { readyToTrain } from '../pilotProgression';
import { authoredDesignName } from '../designLabel';
import { PilotPortrait } from '../PilotPortrait';
import { HireRow, PilotDetail } from './PilotDetail';
import type { CampaignNavigationTarget } from './campaignNavigation';
import './progression.css';
import './crewOverview.css';

const catalog = getCatalog();
type CrewFilter = 'all' | 'available' | 'wounded' | 'training';
const FILTERS: { id: CrewFilter; label: string }[] = [
  { id: 'all', label: 'All crew' }, { id: 'available', label: 'Available' },
  { id: 'wounded', label: 'Wounded' }, { id: 'training', label: 'Ready to train' },
];
interface Props {
  state: CampaignState;
  mutate: (change: (draft: CampaignState) => string | null | void, message?: string) => void;
  focus?: CampaignNavigationTarget | null;
}

export function crewCanTrain(pilot: PilotRecord): boolean {
  return !pilot.dead && (readyToTrain(catalog, pilot) || pendingTraitPicks(catalog, pilot) > 0);
}

export function BarracksPanel({ state, mutate, focus }: Props) {
  const [section, setSection] = useState<'crew' | 'hiring'>(focus?.hiring ? 'hiring' : 'crew');
  const [filter, setFilter] = useState<CrewFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(focus?.pilotId ?? null);
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus?.area !== 'crew') return;
    setSection(focus.hiring ? 'hiring' : 'crew');
    setFilter('all');
    setSelectedId(focus.pilotId ?? null);
  }, [focus]);
  const crew = state.pilots.filter((pilot) => !pilot.dead);
  const fallen = state.pilots.filter((pilot) => pilot.dead);
  const hires = availableHires(catalog, state);
  const trainable = crew.filter(crewCanTrain).length;
  const matches = (pilot: PilotRecord, choice: CrewFilter): boolean => choice === 'all'
    || (choice === 'available' && isPilotAvailable(state, pilot))
    || (choice === 'wounded' && !isPilotAvailable(state, pilot))
    || (choice === 'training' && crewCanTrain(pilot));
  const visible = crew.filter((pilot) => matches(pilot, filter));
  const selected = visible.find((pilot) => pilot.id === selectedId) ?? visible[0];
  return <section className="camp-roster progression-roster crew-overview" data-testid="camp-roster">
    <header className="roster-ledger"><h3>Barracks{trainable > 0 ? <span className="train-ready"
      data-testid="train-ready">{trainable} ready to train</span> : null}</h3>
      <strong>{Math.round(dailyPayroll(catalog, state)).toLocaleString('en-GB')} C/day</strong>
    </header>
    <div className="crew-sections" aria-label="Crew services">
      <button type="button" aria-pressed={section === 'crew'} data-testid="crew-overview-tab" onClick={() => setSection('crew')}>Company crew · {crew.length}</button>
      <button type="button" aria-pressed={section === 'hiring'} data-testid="crew-hiring-tab" onClick={() => setSection('hiring')}>Hiring hall · {hires.length}</button>
    </div>
    <p className="ledger-note">Earn XP on campaign missions, then choose a skill to train. Wounded pilots miss the next mission; waiting days does not clear a mission injury. Injured crew remain on payroll.</p>
    <div hidden={section !== 'crew'}>
      <div className="crew-filters" aria-label="Filter crew">{FILTERS.map((entry) => <button key={entry.id}
        type="button" aria-pressed={filter === entry.id} data-testid={`crew-filter-${entry.id}`}
        onClick={() => setFilter(entry.id)}>{entry.label} · {crew.filter((pilot) => matches(pilot, entry.id)).length}</button>)}</div>
      <div className="crew-workspace">
        <ul className="crew-list" aria-label="Company crew">{visible.map((pilot) => {
          const mech = state.mechs.find((entry) => entry.id === pilot.mechId);
          const ready = isPilotAvailable(state, pilot);
          return <li key={pilot.id} data-testid={`camp-pilot-${pilot.id}`}>
            <button type="button" aria-pressed={selected?.id === pilot.id} data-testid={`crew-select-${pilot.id}`}
              onClick={() => {
                setSelectedId(pilot.id);
                if (window.matchMedia('(max-width: 850px)').matches) {
                  requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }));
                }
              }}>
              <PilotPortrait pilot={pilot} compact /><span className="crew-row-identity"><strong>{pilot.name}</strong>
                <small>{mech === undefined ? 'No machine assigned' : authoredDesignName(catalog, mech.design)}</small>
                <small className={ready ? 'crew-ready' : 'crew-wounded'}>{ready ? 'Available' : (pilot.recoveryMissions ?? 0) > 0 ? 'Wounded · misses next mission' : `Wounded until day ${pilot.injuredUntilDay}`}</small>
              </span><span className="crew-row-training">{availableXp(pilot)} XP<small>{crewCanTrain(pilot) ? 'Ready to train' : 'Building experience'}</small></span>
            </button>
          </li>;
        })}</ul>
        {selected === undefined ? <p className="camp-empty">No crew in this view.</p> : <div ref={detailRef} className="crew-detail-anchor"><PilotDetail pilot={selected} state={state} mutate={mutate} /></div>}
      </div>
      {fallen.length === 0 ? null : <details className="pilot-memorial" data-testid="pilot-memorial">
        <summary>Roll of honour · {fallen.length} lost</summary><ul>{fallen.map((pilot) => <li key={pilot.id} data-testid={`memorial-${pilot.id}`}>
          <PilotPortrait pilot={pilot} compact /><span>{pilot.name} · Killed in action</span>
        </li>)}</ul>
      </details>}
    </div>
    <div hidden={section !== 'hiring'} data-testid="crew-hiring-panel"><h4>Hiring hall</h4>
      <p className="ledger-note">Sign a reserve to cover an injury, then assign a machine in their crew record. Signing costs and daily wages are shown before you hire.</p>
      <ul className="camp-hires">{hires.map((hire) => <HireRow key={hire.id} hire={hire} state={state} mutate={mutate} />)}
        {hires.length === 0 ? <li className="camp-empty">Nobody left on the register.</li> : null}</ul>
    </div>
  </section>;
}
