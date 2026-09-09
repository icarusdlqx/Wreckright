import type { Catalog } from '../schema/load';
import type { DifficultyChoice } from './battleSetupState';
import { BriefingTeam } from './BriefingTeam';
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
  const lance = briefingLanceFor(props.catalog, props.missionId, props.lance, props.onLance, props.onCustomise, props.difficultyId);
  lance.allowance = skirmishEnemyAllowance(props.catalog, props.missionId);
  const tier = props.difficulties.find((candidate) => candidate.id === props.difficultyId);
  const scripted = props.catalog.missions.get(props.missionId)?.triggers.some((trigger) =>
    trigger.effects.some((effect) => effect.type === 'spawn')) ?? false;
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
      <BriefingTeam lance={lance} enemy />
    </details>
    <p className="setup-description">{scripted
      ? 'These are the starting enemy mechs. This scenario also has authored reinforcements; choose a Skirmish map for a pure lance battle.'
      : 'Empty berths let you field fewer, heavier machines. Pure skirmishes give both sides the same tonnage limit.'}</p>
  </section>;
}
