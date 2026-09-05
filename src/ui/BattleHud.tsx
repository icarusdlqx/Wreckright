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
import type { SupportOption } from './supportOptions';
import { SensorSweepReadout } from './SensorSweepReadout';
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

interface BattleHudProps {
  engine: Engine | null;
  supportOptions: readonly SupportOption[];
  trainingStep?: TrainingStep | null;
}

export function BattleHud({ engine, supportOptions, trainingStep = null }: BattleHudProps) {
  const state = useGame();
  const compact = useCompactLayout();
  const unit = selectedUnit(state);
  const playerControlled = unit !== null && unit.team === state.playerTeam && unit.alive;
  const fullHud = trainingShowsFullHud(trainingStep);
  const showsContacts = trainingShowsContacts(trainingStep);
  const visibleCommands = trainingCommandIds(trainingStep);

  const onCommand = (command: Command): void => {
    if (engine === null) return;

    const routeCommand = ['move', 'run', 'attack_move'].includes(command.id);
    if (!routeCommand || state.orderMode === command.mode) {
      state.patch({ queueOrders: false });
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
      <SensorSweepReadout world={engine?.world ?? null} />
      {fullHud ? <UnitPanel engine={engine} /> : null}
      {showsContacts ? (
        <HostileBar
          enemies={state.enemies}
          contacts={state.contacts}
          targetIds={selectedTargetIds(state.units, state.selection)}
          hasSelection={state.units.some(
            (entry) => state.selection.includes(entry.id) && entry.alive,
          )}
          onTarget={(id) => engine?.orderAttack(id, null)}
          onContact={(contact) => engine?.engageContact(contact.id, contact.position)}
        />
      ) : null}
      {fullHud ? <Minimap engine={engine} /> : null}
      <footer className={`bottombar tactical-command-deck${fullHud ? '' : ' training-bottombar'}`}>
        {trainingShowsHeatReadout(trainingStep) ? (
          <TrainingHeatReadout unit={playerControlled ? unit : null} />
        ) : null}
        <div className="camera-lance-row">
          <CentreSelectionButton engine={engine} className="command camera-centre" />
          <CommanderToggle disabled={engine === null} />
          <LanceBar
            units={state.units}
            selection={state.selection}
            onSelect={(id) => state.setSelection([id])}
          />
        </div>
        {fullHud || visibleCommands === null || visibleCommands.size > 0 ? (
          <div className="command-support-row">
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
                onPick={(call) => state.setSupportMode(state.supportMode === call ? null : call)}
              />
            ) : null}
          </div>
        ) : null}
      </footer>
    </>
  );
}
