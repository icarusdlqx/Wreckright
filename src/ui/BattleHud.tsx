import { CommandPalette, type Command } from './CommandPalette';
import { CentreSelectionButton } from './CentreSelectionButton';
import { CommanderToggle } from './CommanderToggle';
import { CommanderView } from './CommanderView';
import { selectedTargetIds } from './ContactsBar';
import type { Engine } from './engine';
import { FormationPicker } from './FormationPicker';
import { Minimap } from './Minimap';
import { MobileBattleHud } from './MobileBattleHud';
import { HostileBar, LanceBar, SupportPalette } from './Panels';
import { selectedUnit, useGame } from './store';
import { selectionAfterClick } from './selectionAfterClick';
import { useEffect, useRef, useState } from 'react';
import { resetCommanderView } from './commanderViewState';
import type { SupportOption } from './supportOptions';
import { SensorSweepReadout } from './SensorSweepReadout';
import { SupportStatus } from './SupportStatus';
import { TrainingHeatReadout } from './TrainingHeatReadout';
import {
  trainingCommandIds,
  trainingShowsContacts,
  trainingShowsFullHud,
  trainingShowsHeatReadout,
} from './trainingPresentation';
import type { TrainingStep } from './trainingProgress';
import { UnitPanel } from './UnitPanel';
import { useCompactLayout } from './useCompactLayout';
import { FieldRadioPanel } from './FieldRadioPanel';
import { CommandReceipt } from './CommandReceipt';
import { selectionAbilities } from './selectionAbilities';
import './battleStatusLayout.css';
import { useBattleDockSize } from './useBattleDockSize';
import { DockUnitSummary } from './DockUnitSummary';
import './pilotCombatDock.css';

interface BattleHudProps {
  engine: Engine | null;
  supportOptions: readonly SupportOption[];
  trainingStep?: TrainingStep | null;
}

export function BattleHud({ engine, supportOptions, trainingStep = null }: BattleHudProps) {
  const state = useGame();
  const compact = useCompactLayout();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const inspectorOpen = detailsOpen || state.orderMode === 'called_shot';
  const detailsToggleRef = useRef<HTMLButtonElement>(null);
  const inspectorCloseRef = useRef<HTMLButtonElement>(null);
  const focusRequested = useRef(false);
  const wasInspecting = useRef(false);
  useEffect(() => {
    if (inspectorOpen && focusRequested.current) {
      inspectorCloseRef.current?.focus();
      focusRequested.current = false;
    }
    if (wasInspecting.current && !inspectorOpen) detailsToggleRef.current?.focus();
    wasInspecting.current = inspectorOpen;
  }, [inspectorOpen]);
  const dockRef = useBattleDockSize(!compact);
  const unit = selectedUnit(state);
  const playerControlled = unit !== null && unit.team === state.playerTeam && unit.alive;
  const abilities = selectionAbilities(state.units, state.selection, state.playerTeam, engine);
  const fullHud = trainingShowsFullHud(trainingStep);
  const showsContacts = trainingShowsContacts(trainingStep);
  const visibleCommands = trainingCommandIds(trainingStep);
  useEffect(() => { if (!fullHud) resetCommanderView(); }, [fullHud]);

  const onCommand = (command: Command): void => {
    if (engine === null) return;

    const routeCommand = ['move', 'run', 'attack_move'].includes(command.id);
    if (!routeCommand || state.orderMode === command.mode) {
      state.patch({ queueOrders: false });
    }

    if (command.id === 'stop') {
      engine.orderStop();
      state.setOrderMode(null);
      return;
    }
    if (command.id === 'hold_fire') {
      engine.toggleHoldFire();
      return;
    }
    if (command.id === 'hold_position') {
      engine.setPosture(command.id);
      return;
    }
    if (command.id === 'ability') {
      engine.useAbilities();
      return;
    }
    if (command.id === 'alpha_strike') {
      engine.alphaStrike();
      return;
    }
    if (command.id === 'heat_safety') {
      engine.toggleHeatSafety();
      return;
    }
    state.setOrderMode(state.orderMode === command.mode ? null : command.mode);
  };

  if (compact) {
    return (
      <>
        {fullHud ? <CommanderView engine={engine} compact /> : null}
        <SensorSweepReadout world={engine?.world ?? null} />
        <MobileBattleHud
          engine={engine}
          supportOptions={supportOptions}
          trainingStep={trainingStep}
          onCommand={onCommand}
        />
      </>
    );
  }

  return (
    <>
      {fullHud ? <CommanderView engine={engine} /> : null}
      {fullHud ? <UnitPanel engine={engine} hidden={!inspectorOpen} closeButtonRef={inspectorCloseRef} onClose={() => {
        setDetailsOpen(false);
        if (state.orderMode === 'called_shot') state.setOrderMode(null);
      }} /> : null}
      <div className="battle-field-status">
      {showsContacts ? (
        <HostileBar
          enemies={state.enemies}
          contacts={state.contacts}
          targetIds={selectedTargetIds(state.units, state.selection)}
          hasSelection={state.units.some(
            (entry) => state.selection.includes(entry.id) && entry.alive,
          )}
          onTarget={(id) => engine?.orderAttack(id, state.orderMode === 'called_shot' ? state.calledShotLocation : null)}
          onContact={(contact) => engine?.engageContact(contact.id, contact.position)}
        />
      ) : null}
      <SensorSweepReadout world={engine?.world ?? null} />
      </div>
      <footer ref={dockRef} className={`bottombar tactical-command-deck${fullHud ? ' pilot-command-dock' : ' training-bottombar'}`}>
        {fullHud ? <div className="battle-communications"><CommandReceipt /><FieldRadioPanel /><SupportStatus world={engine?.world ?? null} paused={state.paused} /></div> : null}
        {trainingShowsHeatReadout(trainingStep) ? (
          <TrainingHeatReadout unit={playerControlled ? unit : null} />
        ) : null}
        <div className="pilot-dock-map">
          {fullHud ? <Minimap engine={engine} /> : null}
          <div className="pilot-dock-map-controls">
          <CentreSelectionButton engine={engine} className="command camera-centre" />
          {fullHud ? <CommanderToggle disabled={engine === null} /> : null}
          </div>
        </div>
        <div className="camera-lance-row">
          <LanceBar
            units={state.units}
            selection={state.selection}
            onSelect={(id, additive) => state.setSelection(selectionAfterClick(state.selection, id, additive))}
          />
        </div>
        {fullHud || visibleCommands === null || visibleCommands.size > 0 ? (
          <div className="command-support-row">
            {fullHud ? <DockUnitSummary engine={engine} expanded={inspectorOpen} toggleRef={detailsToggleRef} onToggle={() => {
              focusRequested.current = !inspectorOpen;
              if (state.orderMode === 'called_shot') state.setOrderMode(null);
              setDetailsOpen(!inspectorOpen);
            }} /> : null}
            {visibleCommands !== null && visibleCommands.size === 0 ? null : (
              <CommandPalette
                leading={
                  fullHud ? (
                    <FormationPicker
                      value={state.formationPreset}
                      onChange={state.setFormationPreset}
                    />
                  ) : undefined
                }
                visibleCommandIds={visibleCommands}
                orderMode={state.orderMode}
                enabled={playerControlled}
                holdingFire={unit?.holdingFire ?? false}
                heatSafety={unit?.heatSafety ?? false}
                ability={unit?.ability ?? null}
                abilitySelection={abilities}
                alpha={unit?.alpha ?? null}
                jump={
                  unit === null
                    ? null
                    : { ready: unit.canJump, range: unit.jumpRange, cooldown: unit.jumpCooldown }
                }
                posture={unit?.posture ?? 'free'}
                onCommand={onCommand}
              />
            )}
            {fullHud ? (
              <SupportPalette
                options={supportOptions}
                resourcePoints={state.resourcePoints}
                active={state.supportMode}
                notice={state.supportNotice}
                reservesLeft={state.reservesLeft}
                paused={state.paused}
                onPick={(call) => state.setSupportMode(state.supportMode === call ? null : call)}
              />
            ) : null}
          </div>
        ) : null}
      </footer>
    </>
  );
}
