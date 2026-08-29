import { useMemo } from 'react';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import {
  compareBuildToStock,
  type BuildCompareMetric,
} from './buildCompareModel';
import './buildCompare.css';

export interface BuildCompareProps {
  catalog: Catalog;
  design: Design;
}

function Metric({ metric }: { metric: BuildCompareMetric }) {
  const glyph = metric.direction === 'good' ? '↑' : metric.direction === 'bad' ? '↓' : '—';

  return (
    <div
      className={`build-compare__metric is-${metric.direction}`}
      data-testid={`build-compare-${metric.id}`}
      data-direction={metric.direction}
    >
      <dt>{metric.label}</dt>
      <dd>
        <span className="build-compare__values">
          <span className="build-compare__before">{metric.beforeText}</span>
          <span className="build-compare__arrow" aria-hidden="true">→</span>
          <strong>{metric.afterText}</strong>
          <span className="build-compare__unit">{metric.unit}</span>
        </span>
        <span className="build-compare__direction">
          <span aria-hidden="true">{glyph} {metric.deltaText}</span>
          <span className="build-compare__sr-only">
            {metric.label} {metric.directionText}
          </span>
        </span>
      </dd>
    </div>
  );
}

export function BuildCompare({ catalog, design }: BuildCompareProps) {
  const comparison = useMemo(
    () => compareBuildToStock(catalog, design),
    [catalog, design],
  );

  if (comparison === null) {
    return (
      <section
        className="build-compare build-compare--missing"
        aria-labelledby="build-compare-title"
        data-testid="build-compare"
        data-state="missing"
      >
        <header>
          <p>Build delta</p>
          <h3 id="build-compare-title">Stock comparison unavailable</h3>
        </header>
        <p>No authored design uses this chassis, so there is no honest baseline.</p>
      </section>
    );
  }

  return (
    <section
      className="build-compare"
      aria-labelledby="build-compare-title"
      data-testid="build-compare"
      data-state="ready"
    >
      <header className="build-compare__header">
        <p>Build delta</p>
        <h3 id="build-compare-title">Compared with stock</h3>
        <span data-testid="build-compare-baseline">{comparison.baselineName}</span>
      </header>
      <dl className="build-compare__metrics" aria-label="Stock to current build metrics">
        {comparison.metrics.map((metric) => <Metric key={metric.id} metric={metric} />)}
      </dl>
    </section>
  );
}
