import type { Catalog } from '../../schema/load';
import { isMechAvailable, isPilotAvailable, type CampaignState } from '../../campaign/types';
import { PilotPortrait } from '../PilotPortrait';
import { MachinePortrait } from '../mechbay/MachinePortrait';
import { machineDisplayName } from '../designLabel';
import { PREP_PILOT_DRAG_TYPE } from './DeploymentStrip';

interface Props {
  catalog: Catalog;
  state: CampaignState;
  view: 'machines' | 'pilots';
  mechId: string | null;
  pilotId: string | null;
  onMech: (id: string) => void;
  onPilot: (id: string) => void;
}

export function PreparationRoster({ catalog, state, view, mechId, pilotId, onMech, onPilot }: Props) {
  return <aside className="prep-roster" aria-label={view === 'machines' ? 'Company machines' : 'Company pilots'}>
    <h4>{view === 'machines' ? 'Company machines' : 'Company pilots'}</h4>
    <div className="prep-roster-list">
      {view === 'machines' ? state.mechs.map((mech) => {
        const chassis = catalog.chassis.get(mech.design.chassisId);
        const seat = state.deploymentSeats?.findIndex((entry) => entry.mechId === mech.id) ?? -1;
        const ready = isMechAvailable(state, mech) && mech.status !== 'hulk';
        return <button key={mech.id} type="button" className="prep-roster-entry" aria-pressed={mech.id === mechId}
          data-testid={`prep-machine-${mech.id}`} onClick={() => onMech(mech.id)}>
          {chassis === undefined ? null : <span className="prep-roster-machine" aria-hidden="true"><MachinePortrait chassis={chassis} /></span>}
          <span><strong>{machineDisplayName(catalog, mech.design)}</strong><small>{chassis?.tonnage ?? '?'}t · Bay {mech.id.replace(/^mech[-_]/, '')}</small>
            <small>{seat >= 0 ? `Seat ${seat + 1}` : 'Reserve'} · {ready ? mech.design.mounts.length > 0 ? 'Fieldable' : 'Needs weapon' : mech.status === 'hulk' ? 'Wreck' : 'Workshop'}</small></span>
        </button>;
      }) : state.pilots.filter((pilot) => !pilot.dead).map((pilot) => {
        const seat = state.deploymentSeats?.findIndex((entry) => entry.pilotId === pilot.id) ?? -1;
        const available = isPilotAvailable(state, pilot);
        return <button key={pilot.id} type="button" className="prep-roster-entry" aria-pressed={pilot.id === pilotId}
          data-testid={`prep-pilot-${pilot.id}`} onClick={() => onPilot(pilot.id)} draggable={available}
          onDragStart={(event) => { event.dataTransfer.setData(PREP_PILOT_DRAG_TYPE, pilot.id); event.dataTransfer.effectAllowed = 'move'; }}>
          <PilotPortrait pilot={pilot} compact /><span><strong>{pilot.name}</strong>
            <small>{available ? seat >= 0 ? `Seat ${seat + 1}` : 'Reserve · available' : 'Injured · misses next mission'}</small>
            <small>G {pilot.gunnery}/5 · P {pilot.piloting}/5 · S {pilot.sensors}/5</small></span>
        </button>;
      })}
    </div>
  </aside>;
}
