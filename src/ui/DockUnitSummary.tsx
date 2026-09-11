import type { Ref } from 'react';
import type { Engine } from './engine';
import { selectedUnit, useGame } from './store';
import { PaperDoll } from './PaperDoll';
import { CommandIntent } from './CommandIntent';
import { lanceStatus } from './lanceCardState';

export function DockUnitSummary({ engine, expanded, onToggle, toggleRef }: {
  engine: Engine | null;
  expanded: boolean;
  onToggle: () => void;
  toggleRef?: Ref<HTMLButtonElement>;
}) {
  const state = useGame();
  const unit = selectedUnit(state);
  const preview = state.hitPreview?.shooterId === unit?.id ? state.hitPreview : null;
  const target = preview?.targetName ?? unit?.targetName ?? 'No priority target';
  const range = preview?.range ?? unit?.targetRange;
  return <section className="dock-selected" data-testid="dock-selected" aria-label="Selected unit and target">
    {unit === null ? <div className="dock-selected-empty">Choose a pilot card or select a mech in the field.</div> : <>
      <PaperDoll locations={unit.locations} miniature />
      <div className="dock-selected-copy">
        <strong>{unit.pilotName}<span>{unit.name} · {lanceStatus(unit)}</span></strong>
        <p className="dock-target">{preview?.hover ? 'Sizing up' : 'Target'}: <b>{target}</b>{range == null ? null : <span>{Math.round(range)}m</span>}</p>
        {!expanded && unit.team === state.playerTeam && unit.alive ? <CommandIntent engine={engine} unit={unit} /> : null}
      </div>
    </>}
    <button ref={toggleRef} type="button" className="dock-details-toggle" data-testid="unit-details-toggle"
      aria-expanded={expanded} aria-controls="battle-unit-inspector" onClick={onToggle}>
      {expanded ? 'Hide details' : 'Show details'}
    </button>
  </section>;
}
