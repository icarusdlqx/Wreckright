import type { MechLocation } from '../schema/common';
import type { Engine } from './engine';
import { PaperDoll } from './PaperDoll';
import type { UnitSnapshot } from './store';

function integrityOf(unit: UnitSnapshot): { fraction: number; armour: number; internal: number } {
  let armour = 0;
  let armourMax = 0;
  let internal = 0;
  let internalMax = 0;
  for (const location of Object.values(unit.locations)) {
    armour += location.armour + location.rearArmour;
    armourMax += location.armourMax + location.rearArmourMax;
    internal += location.internal;
    internalMax += location.internalMax;
  }
  const max = armourMax + internalMax;
  return {
    fraction: max === 0 ? 0 : (armour + internal) / max,
    armour: armourMax === 0 ? 0 : armour / armourMax,
    internal: internalMax === 0 ? 0 : internal / internalMax,
  };
}

function stateLine(unit: UnitSnapshot): string {
  if (!unit.alive) return (unit.killMethod ?? 'destroyed').replace('_', ' ');
  if (unit.shutdownRemaining > 0) return 'shut down';
  if (unit.downRemaining > 0) return 'knocked down';
  if (unit.staggered) return 'staggered';
  return unit.motion;
}

/**
 * The hostile the player is looking at.
 *
 * A click on an enemy with a lance selected is an attack order, which is what
 * a commander expects; but it left the enemy's condition invisible unless the
 * player first cleared the selection. The panel reads the same snapshot the
 * hostile bar already has, and its paper doll doubles as the called-shot
 * picker, so "shoot the legs" is a click on the legs.
 */
export function EnemyPanel({
  engine,
  enemy,
  canOrder,
  onDismiss,
  onCalledShot,
}: {
  engine: Engine | null;
  enemy: UnitSnapshot;
  canOrder: boolean;
  onDismiss: () => void;
  onCalledShot: (location: MechLocation) => void;
}) {
  const integrity = integrityOf(enemy);
  const lost = enemy.lostLocations.map((location) => location.replace('_', ' '));

  return (
    <section className="enemy-panel" data-testid="enemy-panel" aria-label="Target condition">
      <header className="enemy-panel-head">
        <span className="enemy-panel-label">Target</span>
        <strong>{enemy.identity}</strong>
        <button type="button" className="enemy-panel-dismiss" onClick={onDismiss} aria-label="Stop inspecting">
          ×
        </button>
      </header>
      <div className="enemy-panel-integrity" data-testid="enemy-integrity">
        <span className="enemy-panel-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(integrity.fraction * 100)}>
          <span style={{ width: `${Math.round(integrity.fraction * 100)}%` }} />
        </span>
        <small>
          {Math.round(integrity.fraction * 100)}% intact · armour {Math.round(integrity.armour * 100)}% ·
          structure {Math.round(integrity.internal * 100)}%
          {enemy.rangeToLance === null ? '' : ` · ${Math.round(enemy.rangeToLance)}m`}
        </small>
        <small className="enemy-panel-state">
          {stateLine(enemy)}
          {lost.length === 0 ? '' : ` · lost ${lost.join(', ')}`}
        </small>
      </div>
      <PaperDoll
        locations={enemy.locations}
        testIdPrefix="target-doll"
        {...(canOrder && enemy.alive ? { onSelectLocation: onCalledShot } : {})}
      />
      {canOrder && enemy.alive ? (
        <p className="enemy-panel-hint">
          Click a section to call the shot. Legs cripple the machine and keep its root for salvage.
        </p>
      ) : null}
      {canOrder && enemy.alive ? (
        <button
          type="button"
          className="command enemy-panel-attack"
          onClick={() => engine?.orderAttack(enemy.id, null)}
          data-testid="enemy-panel-attack"
        >
          Attack
        </button>
      ) : null}
    </section>
  );
}
