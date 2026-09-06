import type { Catalog } from '../../schema/load';
import { mechIntegrity } from '../../campaign/integrity';
import { isMechAvailable, isPilotAvailable, type CampaignState, type MechRecord, type PilotRecord } from '../../campaign/types';
import { PilotStats } from '../PilotStats';
import { PilotPortrait } from '../PilotPortrait';
import { PilotAssessment } from '../PilotProfile';
import { authoredDesignName } from '../designLabel';
import { companyMachineLabel, occupiedSeatLabel } from './companyLabels';
import { MachineIdentity } from './MachineIdentity';

interface Props {
  catalog: Catalog;
  state: CampaignState;
  pilot: PilotRecord;
  mech: MechRecord | null;
  aboard: boolean;
  position: number;
  refusal: string | null;
  onToggle: () => void;
  onSeat: (mechId: string) => void;
  onRefit: (mechId: string) => void;
}

export function LanceCard({ catalog, state, pilot, mech, aboard, position, refusal, onToggle, onSeat, onRefit }: Props) {
  const available = isPilotAvailable(state, pilot);
  const integrity = mech === null ? null : mechIntegrity(catalog, mech);
  const status = pilot.dead ? 'No longer on the active roster — replace this seat'
    : !available ? (pilot.recoveryMissions ?? 0) > 0 ? 'Infirmary — misses next mission' : `Infirmary until day ${pilot.injuredUntilDay}`
      : mech === null ? 'No fieldable machine assigned or free'
        : !isMechAvailable(state, mech) ? mech.status === 'hulk' ? 'Mech needs rebuilding' : `Workshop until day ${mech.readyOnDay}`
          : mech.design.mounts.length === 0 ? 'Mech needs a weapon' : `${catalog.chassis.get(mech.design.chassisId)?.tonnage ?? 0}t · fieldable`;
  return <li className={`manifest-row lance-card ${aboard ? 'drops' : 'reserve'}${available ? '' : ' unfit'}`}
    data-testid={`manifest-${pilot.id}`}>
    <div className="manifest-pilot">
      <PilotPortrait pilot={pilot} compact />
      <span data-testid={aboard ? `manifest-aboard-${pilot.id}` : undefined} className={`exp-readiness ${aboard ? 'is-dropping' : 'is-reserve'}`}>
        {aboard ? `Aboard ${String(position + 1).padStart(2, '0')}` : 'Reserve'}</span>
      <strong className="pilot-name">{pilot.name}</strong>
      <small className="manifest-status">{status}</small>
    </div>
    <div className="manifest-mech">
      {mech === null ? null : <MachineIdentity catalog={catalog} design={mech.design} companyLabel={companyMachineLabel(catalog, mech)} />}
      {mech !== null && pilot.mechId !== mech.id ? <small className="exp-auto-assignment">{aboard ? 'Auto-assigned for this drop.' : 'Available automatic pairing.'} Choosing seats records this assignment.</small> : null}
      <label>Assigned machine<select value={pilot.mechId ?? ''} disabled={pilot.dead}
        onChange={(event) => onSeat(event.target.value)} data-testid={`manifest-seat-${pilot.id}`}
        aria-label={`Mech for ${pilot.name}`}>
        <option value="">— no mech —</option>
        {state.mechs.map((entry) => <option key={entry.id} value={entry.id}>
          {occupiedSeatLabel(catalog, state, entry)}
        </option>)}
      </select></label>
      {mech === null || integrity === null ? null : <div className="manifest-health" role="progressbar"
        aria-label={`${authoredDesignName(catalog, mech.design)} integrity`} aria-valuemin={0}
        aria-valuemax={integrity.maximum} aria-valuenow={integrity.current}
        title={`${Math.round(integrity.fraction * 100)}% intact`}>
        <span style={{ width: `${Math.round(integrity.fraction * 100)}%` }} />
      </div>}
      {mech === null || integrity === null ? null : <div className="manifest-condition" data-testid={`manifest-condition-${mech.id}`}>
        <strong className={integrity.fraction < 1 ? 'is-damaged' : ''}>{Math.round(integrity.fraction * 100)}% intact{integrity.fraction < 1 ? ' · damaged' : ''}</strong>
        {Object.entries(mech.condition).filter(([, part]) => part.destroyed).map(([location]) => <span className="is-damaged" key={location}>Missing {location.replaceAll('_', ' ')}</span>)}
      </div>}
      <PilotAssessment pilot={pilot} />
      <div className="manifest-buttons">
        <button type="button" disabled={!aboard && refusal !== null} onClick={onToggle}
          data-testid={`manifest-bench-${pilot.id}`}>{aboard ? 'Move to reserve' : 'Put aboard'}</button>
        <button type="button" disabled={mech === null || mech.status !== 'ready'}
          onClick={() => { if (mech !== null) onRefit(mech.id); }} data-testid={`manifest-refit-${pilot.id}`}>Refit</button>
      </div>
      {!aboard && refusal !== null ? <small className="lance-refusal">{refusal}</small> : null}
    </div>
    <details className="lance-pilot-detail"><summary>Pilot skills &amp; biography</summary>
      <p className="pilot-bio">{pilot.bio || catalog.pilots.get(pilot.templateId)?.bio}</p>
      <PilotAssessment pilot={pilot} /><PilotStats catalog={catalog} pilot={pilot} />
    </details>
  </li>;
}
