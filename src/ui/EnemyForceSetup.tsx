import type { Catalog } from '../schema/load';
import type { DifficultyChoice } from './battleSetupState';
import { briefingLanceFor } from './briefingLance';
import { lanceFaction, type SkirmishBerth } from './lance';
import { skirmishEnemyAllowance } from './skirmishForces';

export interface EnemyForceSetupProps {
  catalog: Catalog;
  missionId: string;
  lance: SkirmishBerth[];
  difficultyId: string;
  difficulties: readonly DifficultyChoice[];
  onDifficulty: (tier: string) => void;
  onLance: (next: SkirmishBerth[]) => void;
  onFaction: (faction: 'linewrought' | 'aurelian' | 'mixed') => void;
  onCustomise: (index: number) => void;
}

export function EnemyForceSetup(props: EnemyForceSetupProps) {
  const lance = briefingLanceFor(props.catalog, props.missionId, props.lance, props.onLance, props.onCustomise);
  lance.allowance = skirmishEnemyAllowance(props.catalog, props.missionId);
  const tier = props.difficulties.find((candidate) => candidate.id === props.difficultyId);
  const scripted = props.catalog.missions.get(props.missionId)?.triggers.some((trigger) =>
    trigger.effects.some((effect) => effect.type === 'spawn')) ?? false;
  const taken = (id: string) => lance.berths.some((berth) => berth.designValue !== 'empty' && berth.pilotId === id);
  return <section className="enemy-force-setup briefing-lance" data-testid="enemy-force-setup">
    <h4>AI enemy <span className={`briefing-tonnage${lance.total > lance.allowance ? ' over' : ''}`}
      data-testid="enemy-tonnage">{lance.total}/{lance.allowance}t</span></h4>
    <div className="briefing-setup-grid">
      <label className="setup-field"><span>Enemy faction</span>
        <select value={lanceFaction(props.catalog, props.lance) ?? 'mixed'} data-testid="enemy-faction-picker"
          onChange={(event) => props.onFaction(event.target.value as 'linewrought' | 'aurelian' | 'mixed')}>
          <option value="linewrought">Linewrought</option><option value="aurelian">Aurelian Stock</option>
          <option value="mixed">Mixed company</option>
        </select>
        <small className="setup-description">Choosing a faction refills the enemy berths. Pick individual machines below.</small>
      </label>
      <label className="setup-field"><span>Enemy difficulty</span>
        <select value={props.difficultyId} data-testid="briefing-difficulty-picker"
          onChange={(event) => props.onDifficulty(event.target.value)}>
          {props.difficulties.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
        </select>
        <small className="setup-description" data-testid="difficulty-description">{tier?.description}</small>
      </label>
    </div>
    <details className="enemy-roster" open>
      <summary>Enemy mechs &amp; loadouts <span>{lance.berths.filter((berth) => berth.designValue !== 'empty').length} deployed</span></summary>
      {lance.berths.map((berth) => <div className="briefing-berth" key={berth.index}>
        <select value={berth.designValue} onChange={(event) => lance.onDesign(berth.index, event.target.value)}
          aria-label={`Enemy mech for berth ${berth.index + 1}`} data-testid={`enemy-berth-design-${berth.index}`}>
          {berth.customLabel === null ? null : <option value="custom">{berth.customLabel} (edited loadout)</option>}
          <option value="empty">— empty berth —</option>
          {berth.designValue !== 'empty' && berth.designValue !== 'custom' && !lance.designs.some((design) => design.value === berth.designValue)
            ? <option value={berth.designValue}>{props.catalog.designs.get(berth.designValue)?.name ?? berth.designValue} (scenario unit)</option> : null}
          {lance.designs.map((design) => <option key={design.value} value={design.value}>{design.label}</option>)}
          {lance.saved.length === 0 ? null : <optgroup label="Saved loadouts">
            {lance.saved.map((design) => <option key={design.value} value={design.value}>{design.label}</option>)}
          </optgroup>}
        </select>
        <select value={berth.pilotId} onChange={(event) => lance.onPilot(berth.index, event.target.value)}
          aria-label={`Enemy pilot for berth ${berth.index + 1}`} data-testid={`enemy-berth-pilot-${berth.index}`}>
          {lance.pilots.map((pilot) => <option key={pilot.id} value={pilot.id}
            disabled={pilot.id !== berth.pilotId && taken(pilot.id)}>{pilot.name}</option>)}
        </select>
        <button type="button" onClick={() => lance.onCustomise(berth.index)}
          data-testid={`enemy-berth-customise-${berth.index}`}>Refit loadout</button>
      </div>)}
    </details>
    <p className="setup-description">{scripted
      ? 'These are the starting enemy mechs. This scenario also has authored reinforcements; choose a Skirmish map for a pure lance battle.'
      : 'Empty berths let you field fewer, heavier machines. Pure skirmishes give both sides the same tonnage limit.'}</p>
  </section>;
}
