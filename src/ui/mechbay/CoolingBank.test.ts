import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import type { Design } from '../../schema/design';
import { computeHeatProfile } from '../../sim/loadout';
import { CoolingBank, type CoolingBankProps } from './CoolingBank';
import {
  coolingBankSummary,
  coolingCountIntent,
  coolingTypeIntent,
  sustainedCoolingCount,
  type CoolingIntent,
} from './coolingBankModel';

function fixture(): { design: Design; props: Omit<CoolingBankProps, 'onIntent'> } {
  const source = catalog.designs.get('sentinel_brawler');
  if (source === undefined) throw new Error('missing Sentinel design');
  const design = structuredClone(source);
  design.heatSinks += 3;
  const chassis = catalog.chassis.get(design.chassisId);
  if (chassis === undefined) throw new Error('missing Sentinel chassis');
  return {
    design,
    props: {
      catalog,
      chassis,
      design,
      heat: computeHeatProfile(catalog, design),
    },
  };
}

interface TestElementProps {
  children?: ReactNode;
  'data-testid'?: string;
  onClick?: () => void;
  onChange?: (event: { currentTarget: { value: string } }) => void;
}

function findByTestId(node: ReactNode, testId: string): ReactElement<TestElementProps> {
  if (isValidElement<TestElementProps>(node)) {
    if (node.props['data-testid'] === testId) return node;
    let match: ReactElement<TestElementProps> | null = null;
    Children.forEach(node.props.children, (child) => {
      if (match !== null) return;
      try {
        match = findByTestId(child, testId);
      } catch {
        // Keep walking siblings until the requested control is found.
      }
    });
    if (match !== null) return match;
  }
  throw new Error(`missing ${testId}`);
}

describe('cooling bank model', () => {
  it('separates built-in and fitted sinks and prices only fitted units', () => {
    const { design, props } = fixture();
    const summary = coolingBankSummary(
      props.catalog,
      props.chassis,
      design,
      props.heat,
    );
    const sink = catalog.equipment.get(design.heatSinkId);
    if (sink === undefined) throw new Error('missing heat sink');

    expect(summary.internalSinks).toBe(props.chassis.internalHeatSinks);
    expect(summary.fittedSinks).toBe(design.heatSinks - props.chassis.internalHeatSinks);
    expect(summary.fittedTonnage).toBe(summary.fittedSinks * sink.tonnage);
    expect(summary.fittedSlots).toBe(summary.fittedSinks * sink.slots);
    expect(summary.riskHeat).toBeCloseTo(
      props.heat.heatCapacity * props.heat.shutdownRiskFraction,
    );
  });

  it('derives the sustained target from authored sink and heat rules', () => {
    const { design, props } = fixture();
    const sink = catalog.equipment.get(design.heatSinkId);
    if (sink === undefined) throw new Error('missing heat sink');
    const perSink = (sink.stats.dissipation ?? 1)
      * catalog.rules.heat.dissipationPerSinkPerSecond;
    const expected = Math.max(
      props.chassis.internalHeatSinks,
      Math.ceil(props.heat.heatPerSecond / perSink),
    );

    expect(sustainedCoolingCount(catalog, props.chassis, design, props.heat.heatPerSecond))
      .toBe(expected);
  });

  it('reports total refit stock, shortages, and unselectable replacement types', () => {
    const { design, props } = fixture();
    const availability = new Map([
      [design.heatSinkId, design.heatSinks - 2],
      ['double_heat_sink', design.heatSinks - 1],
    ]);
    const summary = coolingBankSummary(
      props.catalog,
      props.chassis,
      design,
      props.heat,
      availability,
    );

    expect(summary.stockShortage).toBe(2);
    expect(summary.stockSpare).toBe(0);
    expect(summary.choices.find((choice) => choice.id === design.heatSinkId)?.canSelect).toBe(true);
    expect(summary.choices.find((choice) => choice.id === 'double_heat_sink')?.canSelect)
      .toBe(false);
  });

  it('builds atomic cooling intents without touching a design', () => {
    const { design } = fixture();
    const before = structuredClone(design);
    expect(coolingCountIntent(17)).toEqual({ type: 'set_cooling', heatSinks: 17 });
    expect(coolingTypeIntent('double_heat_sink')).toEqual({
      type: 'set_cooling',
      heatSinkId: 'double_heat_sink',
    });
    expect(design).toEqual(before);
  });
});

describe('cooling bank presentation', () => {
  it('explains allocation, costs, heat balance, risk, and stock in player-facing terms', () => {
    const { props } = fixture();
    const html = renderToStaticMarkup(createElement(CoolingBank, {
      ...props,
      onIntent: () => undefined,
    }));

    expect(html).toContain('aria-labelledby="cooling-bank-title"');
    expect(html).toContain('Cooling bank');
    expect(html).toContain('Internal');
    expect(html).toContain('built into the chassis');
    expect(html).toContain('Fitted');
    expect(html).toMatch(/\d+\.\d+t · \d+ slots?/);
    expect(html).toContain('Sustained weapon heat');
    expect(html).toContain('Dissipation');
    expect(html).toContain('Alpha strike');
    expect(html).toContain('risk line');
    expect(html).toContain('Shutdown risk');
    expect(html).toContain('Cooling stock is unrestricted in this bay.');
    expect(html).toContain('Fit for sustained fire');
  });

  it('labels every control and exposes stock feedback as a polite status', () => {
    const { design, props } = fixture();
    const html = renderToStaticMarkup(createElement(CoolingBank, {
      ...props,
      equipmentAvailability: new Map([
        [design.heatSinkId, design.heatSinks + 2],
        ['double_heat_sink', 0],
      ]),
      onIntent: () => undefined,
    }));

    expect(html).toContain('<label for="cooling-sink-type">Sink type</label>');
    expect(html).toContain('aria-label="Decrease heat sinks"');
    expect(html).toContain('aria-label="Increase heat sinks"');
    expect(html).toContain('aria-labelledby="cooling-count-label"');
    expect(html).toContain('aria-describedby="cooling-count-help cooling-stock"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('2 units spare after this fit');
    expect(html).toMatch(/<option[^>]+disabled=""[^>]*>Compound Heat Sink · 0 available<\/option>/);
  });

  it('emits count, type, and fit intents for the parent preview layer', () => {
    const { design, props } = fixture();
    const intents: CoolingIntent[] = [];
    const tree = CoolingBank({ ...props, onIntent: (intent) => intents.push(intent) });
    const target = coolingBankSummary(
      props.catalog,
      props.chassis,
      design,
      props.heat,
    ).sustainedTarget;

    findByTestId(tree, 'cooling-decrease').props.onClick?.();
    findByTestId(tree, 'cooling-increase').props.onClick?.();
    findByTestId(tree, 'cooling-sink-type').props.onChange?.({
      currentTarget: { value: 'double_heat_sink' },
    });
    findByTestId(tree, 'cooling-sink-count').props.onChange?.({
      currentTarget: { value: '17' },
    });
    findByTestId(tree, 'fit-sustained-cooling').props.onClick?.();

    expect(intents).toEqual([
      { type: 'set_cooling', heatSinks: design.heatSinks - 1 },
      { type: 'set_cooling', heatSinks: design.heatSinks + 1 },
      { type: 'set_cooling', heatSinkId: 'double_heat_sink' },
      { type: 'set_cooling', heatSinks: 17 },
      { type: 'set_cooling', heatSinks: target },
    ]);
  });

  it('keeps controls touch-sized and collapses cleanly on narrow screens', () => {
    const css = readFileSync(new URL('./coolingBank.css', import.meta.url), 'utf8');
    expect(css).toContain('min-height: 44px;');
    expect(css).toContain('@media (max-width: 420px)');
    expect(css).toContain('(pointer: coarse) and (max-width: 1100px)');
    expect(css).toMatch(
      /@media \(max-width: 420px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/,
    );
  });
});
