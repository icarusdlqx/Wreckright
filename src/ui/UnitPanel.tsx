import type { MechLocation } from '../schema/common';
import type { Engine } from './engine';
import { EventLog, HeatBar, WeaponGroups } from './Panels';
import { PaperDoll } from './PaperDoll';
import { getCatalog } from '../schema/load';
import { selectedUnit, useGame } from './store';
import { TacticalReadout } from './TacticalReadout';
import { EnemyPanel } from './EnemyPanel';


/** A trait's painted name; the id only if the rules no longer know it. */
function traitLabel(traitId: string): string {
  return getCatalog().rules.pilotTraits.entries[traitId]?.label ?? traitId;
}

export function UnitPanel({ engine, compact = false }: { engine: Engine | null; compact?: boolean }) {
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
  // The looked-at hostile: the last one clicked, else whatever the selection
  // is shooting at. Never the selected unit itself, which already has the panel.
  const inspectedId = state.inspectedId ?? unit?.targetId ?? null;
  const inspected =
    inspectedId === null || inspectedId === unit?.id
      ? null
      : (state.enemies.find((enemy) => enemy.id === inspectedId) ?? null);

  const onSelectLocation = (location: MechLocation): void => {
    state.setCalledShotLocation(location);
    state.setOrderMode('called_shot');
  };

  return (
    <aside
      className={compact ? 'mobile-unit-panel' : 'sidebar'}
      data-testid={compact ? 'mobile-unit-panel' : 'sidebar'}
    >
      {unit === null && inspected === null ? (
        <p className="empty">
          {compact ? 'Tap a mech or choose it from the lance.' : 'Select a mech — click it, or press Tab to cycle your lance.'}
        </p>
      ) : unit === null ? (
        inspected === null ? null : (
          <EnemyPanel
            engine={engine}
            enemy={inspected}
            canOrder={false}
            onDismiss={() => state.patch({ inspectedId: null })}
            onCalledShot={() => undefined}
          />
        )
      ) : (
        <>
          <h2>
            {unit.pilotName}
            <small>{unit.identity}</small>
          </h2>
          {playerControlled ? (
            <p className="pilot-hand" data-testid="pilot-hand">
              <span title="Gunnery — steadies every shot">G{unit.pilotSkills.gunnery}</span>
              <span title="Piloting — footing and recovery">P{unit.pilotSkills.piloting}</span>
              <span title="Sensors — how far this machine sees">S{unit.pilotSkills.sensors}</span>
              {unit.pilotTraits.map((trait) => (
                <em key={trait}>{traitLabel(trait)}</em>
              ))}
            </p>
          ) : null}
          <PaperDoll
            locations={unit.locations}
            {...(playerControlled ? { onSelectLocation } : {})}
            activeLocation={state.orderMode === 'called_shot' ? state.calledShotLocation : null}
          />
          <HeatBar heat={unit.heat} capacity={unit.heatCapacity} thresholds={state.heatTiers} />
          <div className="target-line">
            {preview === null ? (
              <>
                Target: <strong>{unit.targetName ?? 'none'}</strong>
              </>
            ) : (
              <>
                {preview.hover ? 'Sizing up' : 'Target'}: <strong>{previewTargetName}</strong>
                <span className="target-range">{Math.round(preview.range)}m</span>
              </>
            )}
          </div>
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
          <WeaponGroups
            unit={unit}
            playerTeam={state.playerTeam}
            onToggleGroup={(group) => engine?.toggleGroup(group)}
            onSetWeaponMode={(mountIndex, modeId) =>
              engine?.setWeaponMode(unit.id, mountIndex, modeId)}
            {...(preview === null ? {} : { preview })}
          />
          {inspected === null ? null : (
            <EnemyPanel
              engine={engine}
              enemy={inspected}
              canOrder={playerControlled}
              onDismiss={() => state.patch({ inspectedId: null })}
              onCalledShot={(location) => {
                state.setCalledShotLocation(location);
                engine?.orderAttack(inspected.id, location);
              }}
            />
          )}
          <details className="sidebar-details" open={compact} data-testid="tactical-details">
            <summary>Tactical details</summary>
            <TacticalReadout unit={unit} friendly={unit.team === state.playerTeam} />
          </details>
        </>
      )}

      <details className="sidebar-details log-details" open={compact} data-testid="log-details">
        <summary>
          Combat log <span>{Math.min(8, state.log.length)}</span>
        </summary>
        <EventLog lines={state.log} />
      </details>
    </aside>
  );
}
