import { actionStatus } from './combatTelemetry';
import type { UnitSnapshot } from './store';
import type { Engine } from './engine';

export interface SelectionAbilities {
  ready: number;
  total: number;
  active: number;
  detail: string;
  units: readonly UnitSnapshot[];
}

export function selectionAbilities(units: readonly UnitSnapshot[], selection: readonly number[], playerTeam: number, engine: Engine | null = null): SelectionAbilities | null {
  const selected = units.filter((unit) => selection.includes(unit.id) && unit.team === playerTeam && unit.alive &&
    engine?.world.entities.find((entity) => entity.id === unit.id)?.autopilot !== true);
  if (selected.length < 2) return null;
  return {
    ready: selected.filter((unit) => unit.ability.ready).length,
    total: selected.length,
    active: selected.filter((unit) => unit.ability.activeRemaining > 0).length,
    detail: selected.map((unit) => `${unit.pilotName}: ${unit.ability.label} · ${actionStatus(unit.ability)}. ${unit.ability.note}`).join('\n'),
    units: selected,
  };
}

export function SelectionAbilityDetails({ summary }: { summary: SelectionAbilities | null }) {
  if (summary === null) return null;
  return <details className="selection-abilities" data-testid="selection-abilities">
    <summary>{summary.ready}/{summary.total} pilot abilities ready{summary.active > 0 ? ` · ${summary.active} active` : ''}</summary>
    <ul>{summary.units.map((unit) => <li key={unit.id}>
      <strong>{unit.pilotName} · {unit.ability.label}</strong>
      <span>{actionStatus(unit.ability)}</span><p>{unit.ability.note}</p>
    </li>)}</ul>
  </details>;
}
