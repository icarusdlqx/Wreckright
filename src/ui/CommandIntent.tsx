import type { Engine } from './engine';
import type { UnitSnapshot } from './store';
import { combatIntent } from './combatIntent';
import './fieldCommand.css';

export function CommandIntent({ engine, unit }: { engine: Engine | null; unit: UnitSnapshot }) {
  const intent = engine === null ? null : combatIntent(engine.world, unit);
  if (intent === null) return null;
  const hasRoute = engine?.world.entities.find((entity) => entity.id === unit.id)?.orders.move !== null && unit.hasMoveOrder;
  return <div className={`command-intent command-intent--${intent.tone}`} data-testid="command-intent">
    <details className="command-intent__explanation"><summary>{intent.label}</summary><p>{intent.detail}</p></details>
    {hasRoute ? <button type="button" onClick={() => engine?.setPosture('hold_position')} data-testid="guard-route">Stop route &amp; guard</button> : null}
  </div>;
}
