import type { Engine } from './engine';
import { EventLog, HeatBar, WeaponGroups } from './Panels';
import { PaperDoll } from './PaperDoll';
import { getCatalog } from '../schema/load';
import { selectedUnit, useGame } from './store';
import { TacticalReadout } from './TacticalReadout';
import { selectionReadiness } from './selectionReadiness';
import './tacticalWorkspace.css';
import './focusedUnitPanel.css';
import { CommandIntent } from './CommandIntent';
import { FieldHints } from './FieldHints';
import { CalledShotTarget } from './CalledShotTarget';
import { PilotStats } from './PilotStats';
import type { Ref } from 'react';
import { SalvageIntent } from './SalvageIntent';


/** A trait's painted name; the id only if the rules no longer know it. */
function traitLabel(traitId: string): string {
  return getCatalog().rules.pilotTraits.entries[traitId]?.label ?? traitId;
}

export function UnitPanel({ engine, compact = false, hidden = false, onClose, closeButtonRef }: {
  engine: Engine | null; compact?: boolean; hidden?: boolean; onClose?: () => void;
  closeButtonRef?: Ref<HTMLButtonElement>;
}) {
  const state = useGame();
  const unit = selectedUnit(state);
  const preview =
    unit !== null && state.hitPreview !== null && state.hitPreview.shooterId === unit.id
      ? state.hitPreview
      : null;
  const previewTargetName =
    preview === null
      ? null
      : [...state.units, ...state.enemies].find((candidate) => candidate.id === preview.targetId)
          ?.name ?? preview.targetName;
  const playerControlled = unit !== null && unit.team === state.playerTeam && unit.alive;
  const readiness = unit === null ? null : selectionReadiness(unit);
  const choosingCalledShot = playerControlled && state.orderMode === 'called_shot';

  return (
    <aside
      className={`${compact ? 'mobile-unit-panel' : 'sidebar'} tactical-unit-panel`}
      data-testid={compact ? 'mobile-unit-panel' : 'sidebar'}
      id={compact ? undefined : 'battle-unit-inspector'} hidden={hidden}
      onKeyDown={event => {
        if (event.key === 'Escape' && onClose !== undefined) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {onClose === undefined ? null : <button ref={closeButtonRef} type="button" className="unit-inspector-close" onClick={onClose}>Hide details</button>}
      {unit === null ? (
        <p className="empty">
          {compact ? 'Tap a mech or choose it from the lance.' : 'Select a mech — click it, or press Tab to cycle your lance.'}
        </p>
      ) : (
        <>
          <header className="unit-focus-heading">
            <p className="selection-kicker">{unit.team === state.playerTeam ? 'Machine status' : 'Observed hostile'}</p>
            <h2>{unit.pilotName}<small>{unit.identity.split(' — ')[0]} · {unit.tonnage}t</small></h2>
          </header>
          {readiness === null || readiness.tone === 'normal' ? null : <div className={`selection-readiness ${readiness.tone}`}><span>{readiness.label}</span></div>}
          {choosingCalledShot ? <CalledShotTarget
            enemies={state.enemies}
            currentTargetId={unit.targetId}
            location={state.calledShotLocation}
            onAim={(id, location) => {
              state.setCalledShotLocation(location);
              engine?.orderAttack(id, location);
            }}
            onCancel={() => state.setOrderMode(null)}
          /> : null}
          {choosingCalledShot ? <details className="unit-own-condition"><summary>Your machine condition</summary>
            <PaperDoll locations={unit.locations} />
          </details> : <PaperDoll locations={unit.locations} />}
          <div className="unit-heat-line"><span>Heat</span><HeatBar heat={unit.heat} capacity={unit.heatCapacity} thresholds={state.heatTiers} /></div>
          <div className="target-line">
            {preview === null ? (
              <>
                Target: <strong>{unit.targetName ?? 'none'}</strong>
                {unit.targetRange === null ? null : <span className="target-range">{Math.round(unit.targetRange)}m</span>}
              </>
            ) : (
              <>
                {preview.hover ? 'Sizing up' : 'Target'}: <strong>{previewTargetName}</strong>
                <span className="target-range">{Math.round(preview.range)}m</span>
              </>
            )}
          </div>
          {playerControlled ? <CommandIntent engine={engine} unit={unit} /> : null}
          <p className="unit-system-label">Weapon groups <span>range · ammunition</span></p>
          <WeaponGroups
            unit={unit}
            playerTeam={state.playerTeam}
            onToggleGroup={(group) => engine?.toggleGroup(group)}
            onSetWeaponMode={(mountIndex, modeId) =>
              engine?.setWeaponMode(unit.id, mountIndex, modeId)}
            {...(preview === null ? {} : { preview })}
          />
          <details className="sidebar-details" data-testid="tactical-details">
            <summary>Tactical details</summary>
            <p className="unit-full-identity">{unit.identity}</p>
            {playerControlled ? <div className="pilot-hand" data-testid="pilot-hand">
              <PilotStats catalog={getCatalog()} pilot={{ ...unit.pilotSkills, traits: unit.pilotTraits }} compact />
              <div className="pilot-hand-traits">{unit.pilotTraits.map((trait) => <em key={trait}>{traitLabel(trait)}</em>)}</div>
            </div> : null}
            {playerControlled ? <FieldHints /> : null}
            {preview === null || preview.factors.length === 0 ? null : (
              <div className="hit-factors" data-testid="hit-factors">
                {preview.factors.map((factor) => (
                  <span
                    key={factor.id}
                    className={factor.value < 1 ? 'penalty' : 'bonus'}
                    title={`×${factor.value.toFixed(2)}`}
                  >
                    {factor.label} {factor.value < 1 ? '−' : '+'}
                    {Math.abs(Math.round((factor.value - 1) * 100))}%
                  </span>
                ))}
              </div>
            )}
            <TacticalReadout unit={unit} friendly={unit.team === state.playerTeam} />
            {unit.team === state.playerTeam ? null : <SalvageIntent catalog={getCatalog()} target={unit} />}
          </details>
        </>
      )}
      <details className="sidebar-details log-details" data-testid="log-details">
        <summary>
          Combat log <span>{Math.min(8, state.log.length)}</span>
        </summary>
        <EventLog lines={state.log} />
      </details>
    </aside>
  );
}
