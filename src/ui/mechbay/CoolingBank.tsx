import type { Chassis } from '../../schema/chassis';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import type { HeatProfile } from '../../sim/loadout';
import {
  coolingBankSummary,
  coolingCountIntent,
  coolingTypeIntent,
  type CoolingIntent,
} from './coolingBankModel';
import './coolingBank.css';

export interface CoolingBankProps {
  catalog: Catalog;
  chassis: Chassis;
  design: Design;
  heat: HeatProfile;
  /** Complete equipment allowance for this refit; omitted in an unrestricted bay. */
  equipmentAvailability?: ReadonlyMap<string, number>;
  onIntent: (intent: CoolingIntent) => void;
}

function quantity(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function stockCopy(
  sinkName: string,
  stock: number | null,
  spare: number | null,
  shortage: number,
): string {
  if (stock === null) return 'Cooling stock is unrestricted in this bay.';
  if (shortage > 0) {
    return `${quantity(stock, sinkName)} available; short by ${shortage}.`;
  }
  return `${quantity(stock, sinkName)} available; ${quantity(spare ?? 0, 'unit')} spare after this fit.`;
}

export function CoolingBank({
  catalog,
  chassis,
  design,
  heat,
  equipmentAvailability,
  onIntent,
}: CoolingBankProps) {
  const summary = coolingBankSummary(
    catalog,
    chassis,
    design,
    heat,
    equipmentAvailability,
  );
  const atInternalFloor = design.heatSinks <= summary.internalSinks;
  const atStockLimit = summary.stock !== null && design.heatSinks >= summary.stock;
  const fitBlocked = summary.stock !== null && summary.sustainedTarget > summary.stock;
  const sustainedVerdict = heat.sustainable
    ? 'Sustainable under continuous fire'
    : heat.secondsToShutdownRisk === 0
      ? 'Shutdown risk begins with the alpha strike'
      : `Shutdown risk in ${(heat.secondsToShutdownRisk ?? 0).toFixed(0)} seconds`;
  const alphaVerdict = heat.alphaSafe
    ? 'Below the shutdown-risk line'
    : 'Crosses the shutdown-risk line';

  return (
    <section
      className="cooling-bank"
      aria-labelledby="cooling-bank-title"
      data-testid="cooling-bank"
    >
      <header className="cooling-bank__header">
        <div>
          <h4 id="cooling-bank-title">Cooling bank</h4>
          <p>{summary.sinkName} · {summary.dissipationPerSink.toFixed(2)} heat/s each</p>
        </div>
        <span
          className={`cooling-bank__verdict ${heat.sustainable ? 'is-stable' : 'is-risk'}`}
          role="status"
          data-testid="cooling-verdict"
        >
          {heat.sustainable ? 'Stable' : 'Heat risk'}
        </span>
      </header>

      <dl className="cooling-bank__allocation" aria-label="Heat sink allocation">
        <div>
          <dt>Internal</dt>
          <dd>
            <strong data-testid="cooling-internal">{summary.internalSinks}</strong>
            <span>built into the chassis</span>
          </dd>
        </div>
        <div>
          <dt>Fitted</dt>
          <dd>
            <strong data-testid="cooling-fitted">{summary.fittedSinks}</strong>
            <span>
              {summary.fittedTonnage.toFixed(1)}t · {quantity(summary.fittedSlots, 'slot')}
            </span>
          </dd>
        </div>
      </dl>

      <dl className="cooling-bank__heat" aria-label="Heat balance">
        <div>
          <dt>Sustained weapon heat</dt>
          <dd data-testid="cooling-weapon-heat">{heat.heatPerSecond.toFixed(2)} /s</dd>
        </div>
        <div>
          <dt>Dissipation</dt>
          <dd data-testid="cooling-dissipation">{heat.dissipationPerSecond.toFixed(2)} /s</dd>
        </div>
        <div className={heat.alphaSafe ? 'is-stable' : 'is-risk'}>
          <dt>Alpha strike</dt>
          <dd>
            {heat.alphaStrikeHeat.toFixed(1)} / {summary.riskHeat.toFixed(1)} risk line
            <span>{alphaVerdict}</span>
          </dd>
        </div>
        <div className={heat.sustainable ? 'is-stable' : 'is-risk'}>
          <dt>Shutdown risk</dt>
          <dd>{sustainedVerdict}</dd>
        </div>
      </dl>

      <div className="cooling-bank__controls">
        <label htmlFor="cooling-sink-type">Sink type</label>
        <select
          id="cooling-sink-type"
          value={design.heatSinkId}
          onChange={(event) => onIntent(coolingTypeIntent(event.currentTarget.value))}
          data-testid="cooling-sink-type"
        >
          {summary.choices.map((choice) => (
            <option key={choice.id} value={choice.id} disabled={!choice.canSelect}>
              {choice.name}
              {choice.stock === null ? '' : ` · ${choice.stock} available`}
            </option>
          ))}
        </select>

        <span id="cooling-count-label">Total heat sinks</span>
        <div
          className="cooling-bank__stepper"
          role="group"
          aria-labelledby="cooling-count-label"
        >
          <button
            type="button"
            aria-label="Decrease heat sinks"
            disabled={atInternalFloor}
            onClick={() => onIntent(coolingCountIntent(design.heatSinks - 1))}
            data-testid="cooling-decrease"
          >
            −
          </button>
          <input
            type="number"
            min={summary.internalSinks}
            max={summary.stock === null ? undefined : Math.max(design.heatSinks, summary.stock)}
            step={1}
            value={design.heatSinks}
            aria-labelledby="cooling-count-label"
            aria-describedby="cooling-count-help cooling-stock"
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              if (Number.isInteger(next)) onIntent(coolingCountIntent(next));
            }}
            data-testid="cooling-sink-count"
          />
          <button
            type="button"
            aria-label="Increase heat sinks"
            disabled={atStockLimit}
            onClick={() => onIntent(coolingCountIntent(design.heatSinks + 1))}
            data-testid="cooling-increase"
          >
            +
          </button>
        </div>
        <p id="cooling-count-help" className="cooling-bank__help">
          {summary.internalSinks} are internal. Only the {summary.fittedSinks} fitted units use
          tonnage and whole-chassis slots.
        </p>
        <p
          id="cooling-stock"
          className={summary.stockShortage > 0 ? 'cooling-bank__stock is-risk' : 'cooling-bank__stock'}
          aria-live="polite"
          data-testid="cooling-stock"
        >
          {stockCopy(
            summary.sinkName,
            summary.stock,
            summary.stockSpare,
            summary.stockShortage,
          )}
        </p>
      </div>

      <button
        type="button"
        className="cooling-bank__fit"
        disabled={fitBlocked}
        onClick={() => onIntent(coolingCountIntent(summary.sustainedTarget))}
        aria-describedby={fitBlocked ? 'cooling-fit-shortage' : undefined}
        data-testid="fit-sustained-cooling"
      >
        Fit for sustained fire
        <span>{summary.sustainedTarget} total sinks</span>
      </button>
      {fitBlocked ? (
        <p id="cooling-fit-shortage" className="cooling-bank__fit-note" role="note">
          Sustained fire needs {summary.sustainedTarget}; only {summary.stock} are available.
        </p>
      ) : null}
    </section>
  );
}
