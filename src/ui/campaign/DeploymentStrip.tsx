import type { Catalog } from '../../schema/load';
import { defaultDropBerths, deploymentPlan } from '../../campaign/deployment';
import type { CampaignState } from '../../campaign/types';
import { PilotPortrait } from '../PilotPortrait';
import { MachinePortrait } from '../mechbay/MachinePortrait';
import { machineDisplayName } from '../designLabel';
import { preparationReadiness } from './preparationModel';

interface Props {
  catalog: Catalog;
  state: CampaignState;
  selected: number;
  onSelect?: (index: number) => void;
  onDropPilot?: (index: number, pilotId: string) => void;
  compact?: boolean;
}

export const PREP_PILOT_DRAG_TYPE = 'application/x-wreckright-pilot';

export function DeploymentStrip({ catalog, state, selected, onSelect, onDropPilot, compact = false }: Props) {
  if (state.contract === null) return null;
  const plan = deploymentPlan(catalog, state, state.contract.missionId);
  const count = Math.max(defaultDropBerths(catalog), plan.seats.length, plan.slots);
  return <ol className={`prep-seats${compact ? ' prep-seats--compact' : ''}`} aria-label="Deployment team" data-testid="manifest-actual-drop">
    {Array.from({ length: count }, (_, index) => {
      const seat = plan.seats[index] ?? { mechId: null, pilotId: null };
      const pilot = state.pilots.find((entry) => entry.id === seat.pilotId);
      const mech = state.mechs.find((entry) => entry.id === seat.mechId);
      const chassis = mech === undefined ? undefined : catalog.chassis.get(mech.design.chassisId);
      const empty = seat.mechId === null && seat.pilotId === null;
      const restricted = index >= plan.slots && empty;
      const status = preparationReadiness(state, seat);
      const contents = <>
        {pilot === undefined ? <span className="prep-empty-portrait" aria-hidden="true">{restricted ? '—' : String(index + 1).padStart(2, '0')}</span>
          : <PilotPortrait pilot={pilot} compact />}
        <span className="prep-seat-copy"><strong>{pilot?.name ?? (restricted ? 'Unavailable' : empty ? 'Empty berth' : 'Needs pilot')}</strong>
          <span>{mech === undefined ? restricted ? 'Mission berth limit' : 'Choose a machine' : `${machineDisplayName(catalog, mech.design)} · ${chassis?.tonnage ?? '?'}t`}</span>
          <small className={status === 'Ready' || empty ? '' : 'needs-attention'}>{restricted ? '' : status}</small></span>
        {chassis === undefined ? null : <span className="prep-seat-machine" aria-hidden="true"><MachinePortrait chassis={chassis} /></span>}
      </>;
      return <li key={index} data-testid={pilot === undefined ? `prep-empty-seat-${index}` : `manifest-${pilot.id}`}>
        <button type="button" className={`prep-seat ${empty ? 'is-empty' : ''}`} aria-pressed={selected === index}
          aria-label={`Seat ${index + 1}: ${pilot?.name ?? 'no pilot'}, ${mech === undefined ? 'no machine' : machineDisplayName(catalog, mech.design)}, ${status}`}
          data-testid={`prep-seat-${index}`} disabled={restricted || onSelect === undefined}
          onClick={() => onSelect?.(index)}
          onDragOver={(event) => {
            if (onDropPilot !== undefined && !restricted && event.dataTransfer.types.includes(PREP_PILOT_DRAG_TYPE)) {
              event.preventDefault(); event.dataTransfer.dropEffect = 'move';
            }
          }}
          onDrop={(event) => {
            const id = event.dataTransfer.getData(PREP_PILOT_DRAG_TYPE);
            if (id && onDropPilot !== undefined && !restricted) { event.preventDefault(); onDropPilot(index, id); }
          }}>{contents}</button>
      </li>;
    })}
  </ol>;
}
