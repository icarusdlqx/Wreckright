import { useSyncExternalStore, type CSSProperties } from 'react';
import { PilotPortrait } from './PilotPortrait';
import { machinePortraitSource } from './mechbay/MachinePortrait';
import { readRadioMessage, subscribeRadio } from './fieldRadio';
import { lanceStatus, unitIntegrity } from './lanceCardState';
import type { UnitSnapshot } from './store';
import './pilotCombatDock.css';

export function LanceBar({ units, selection, onSelect }: {
  units: readonly UnitSnapshot[];
  selection: readonly number[];
  onSelect: (id: number, additive: boolean) => void;
}) {
  const radio = useSyncExternalStore(subscribeRadio, readRadioMessage, () => null);
  return <div className="lance pilot-lance" data-testid="lance-bar" aria-label="Deployed pilots and machines"
    style={{ '--lance-count': Math.max(1, units.length) } as CSSProperties}>
    {units.map((unit, index) => {
      const integrity = unitIntegrity(unit);
      const heat = unit.heatCapacity <= 0 ? 0 : Math.min(1, unit.heat / unit.heatCapacity);
      const speaking = radio?.pilot?.id === unit.pilotId;
      const status = lanceStatus(unit);
      const source = machinePortraitSource(unit.chassisId);
      return <button key={unit.id} type="button"
        className={`lance-card pilot-lance-card${selection.includes(unit.id) ? ' selected' : ''}${unit.alive ? '' : ' inactive'}${speaking ? ' speaking' : ''}`}
        onClick={event => onSelect(unit.id, event.shiftKey)}
        title={`${unit.pilotName} · ${unit.identity}\n${status}. ${Math.round(integrity * 100)}% machine integrity.\nClick to select · Shift-click adds or removes · E selects all`}
        aria-pressed={selection.includes(unit.id)} data-testid={`lance-card-${unit.id}`} data-pilot-id={unit.pilotId}
        data-speaking={speaking || undefined} data-machine-state={unit.destroyed ? 'destroyed' : unit.alive ? 'operational' : 'inactive'}>
        <span className="lance-visuals">
          <PilotPortrait pilot={{ id: unit.pilotId, name: unit.pilotName }} compact />
          {source === undefined ? null : <img className="lance-machine" src={source} alt="" width="80" height="90" />}
          <span className="lance-seat" aria-label={`Deployment seat ${index + 1}`}>{String(index + 1).padStart(2, '0')}</span>
          {speaking ? <span className="lance-speaking" aria-label="Speaking on company radio">◖</span> : null}
        </span>
        <span className="lance-name">{unit.pilotName}</span>
        <span className="lance-chassis" title={unit.identity}>{unit.name} · {unit.tonnage}t</span>
        <span className={`lance-health${integrity < .3 ? ' critical' : integrity < .6 ? ' damaged' : ''}`}
          role="meter" aria-label={`${unit.name} integrity`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(integrity * 100)}>
          <span style={{ width: `${integrity * 100}%` }} />
        </span>
        <span className="lance-status">{status}</span>
        <span className="lance-readiness">
          <span className={`lance-heat${heat >= .85 ? ' hot' : ''}`} title={`Heat ${Math.round(unit.heat)}/${unit.heatCapacity}`}>
            <span>Heat</span><i><b style={{ width: `${heat * 100}%` }} /></i>
          </span>
          <span className={`lance-ability${unit.alive && unit.ability.ready ? ' ready' : ''}${unit.ability.activeRemaining > 0 ? ' active' : ''}`}
            title={`${unit.ability.label}: ${unit.ability.note}`}>
            {unit.ability.activeRemaining > 0 ? 'Active' : unit.alive && unit.ability.ready ? 'Ready' : '—'}
          </span>
        </span>
      </button>;
    })}
  </div>;
}
