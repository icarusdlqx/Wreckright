import type { Engine } from './engine';
import type { UnitSnapshot } from './store';
import { combatIntent } from './combatIntent';
import './fieldCommand.css';

export function CommandIntent({ engine, unit }: { engine: Engine | null; unit: UnitSnapshot }) {
  const intent = engine === null ? null : combatIntent(engine.world, unit);
  if (intent === null) return null;
  return <div className={`command-intent command-intent--${intent.tone}`} data-testid="command-intent">
    <strong>{intent.label}</strong><p>{intent.detail}</p>
  </div>;
}
