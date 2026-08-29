import { useId } from 'react';
import type { Catalog } from '../../schema/load';
import type { Weapon } from '../../schema/weapon';
import { formatWeaponNumber } from './weaponPresentation';
import {
  expectedWeaponDpsAtRange,
  loadoutDamageChart,
  RANGE_DAMAGE_MAX_METRES,
  type DamageBand,
  type LoadoutDamageChart,
  type MountedWeaponProfile,
  weaponDamageChart,
} from './rangeDamageChartModel';
import './rangeDamageChart.css';

const WIDTH = 300;
const HEIGHT = 72;
const PLOT_LEFT = 8;
const PLOT_RIGHT = 292;
const PLOT_TOP = 15;
const PLOT_BOTTOM = 54;

function chartX(metres: number): number {
  return PLOT_LEFT
    + (metres / RANGE_DAMAGE_MAX_METRES) * (PLOT_RIGHT - PLOT_LEFT);
}

function chartY(dps: number, peak: number): number {
  if (peak <= 0) return PLOT_BOTTOM;
  return PLOT_BOTTOM - (dps / peak) * (PLOT_BOTTOM - PLOT_TOP);
}

function stepPath(
  bands: readonly { start: number; end: number; dps: number }[],
  peak: number,
): string {
  const first = bands[0];
  if (first === undefined) return '';
  const commands = [`M ${chartX(first.start)} ${chartY(first.dps, peak)}`];
  for (const [index, band] of bands.entries()) {
    if (index > 0) commands.push(`V ${chartY(band.dps, peak)}`);
    commands.push(`H ${chartX(band.end)}`);
  }
  return commands.join(' ');
}

function Axis() {
  return (
    <g aria-hidden="true">
      {[0, 300, 600].map((metres) => (
        <g key={metres}>
          <line
            className="range-damage-chart__grid"
            x1={chartX(metres)}
            x2={chartX(metres)}
            y1={PLOT_TOP}
            y2={PLOT_BOTTOM}
            vectorEffect="non-scaling-stroke"
          />
          <text
            className="range-damage-chart__axis"
            x={chartX(metres)}
            y={67}
            textAnchor={metres === 0 ? 'start' : metres === 600 ? 'end' : 'middle'}
          >
            {metres}m
          </text>
        </g>
      ))}
    </g>
  );
}

function PlotFrame() {
  return (
    <rect
      className="range-damage-chart__frame"
      x={PLOT_LEFT}
      y={PLOT_TOP}
      width={PLOT_RIGHT - PLOT_LEFT}
      height={PLOT_BOTTOM - PLOT_TOP}
      vectorEffect="non-scaling-stroke"
    />
  );
}

function WeaponBands({ weapon, bands, peak }: {
  weapon: Weapon;
  bands: readonly DamageBand[];
  peak: number;
}) {
  return (
    <g data-chart-series="inspected" data-weapon-id={weapon.id} aria-hidden="true">
      {bands.map((band) => (
        <rect
          key={`${band.start}-${band.end}`}
          className="range-damage-chart__weapon-area"
          x={chartX(band.start)}
          y={chartY(band.dps, peak)}
          width={chartX(band.end) - chartX(band.start)}
          height={PLOT_BOTTOM - chartY(band.dps, peak)}
          fill={weapon.visual.colour}
          data-range-start={band.start}
          data-range-end={band.end}
          data-dps={band.dps}
        />
      ))}
      <path
        className="range-damage-chart__weapon-line"
        d={stepPath(bands, peak)}
        stroke={weapon.visual.colour}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

function LoadoutBands({ chart }: { chart: LoadoutDamageChart }) {
  return (
    <>
      {chart.series.map((series) => (
        <g
          key={series.id}
          data-chart-series="loadout"
          data-weapon-id={series.weaponId}
          data-mode-id={series.modeId ?? undefined}
          data-mount-count={series.count}
          aria-hidden="true"
        >
          {chart.bands.map((band) => {
            const layer = band.layers.find((entry) => entry.seriesId === series.id);
            if (layer === undefined || layer.dps <= 0) return null;
            return (
              <rect
                key={`${band.start}-${band.end}`}
                className="range-damage-chart__loadout-area"
                x={chartX(band.start)}
                y={chartY(layer.upper, chart.peak)}
                width={chartX(band.end) - chartX(band.start)}
                height={chartY(layer.lower, chart.peak) - chartY(layer.upper, chart.peak)}
                fill={series.colour}
                data-range-start={band.start}
                data-range-end={band.end}
                data-dps={layer.dps}
              />
            );
          })}
        </g>
      ))}
      <path
        className="range-damage-chart__loadout-line"
        d={stepPath(chart.bands.map((band) => ({ ...band, dps: band.total })), chart.peak)}
        vectorEffect="non-scaling-stroke"
        aria-hidden="true"
      />
    </>
  );
}

function loadoutEnvelopeDescription(chart: LoadoutDamageChart): string {
  const zeroRanges: Array<{ start: number; end: number }> = [];
  for (const band of chart.bands) {
    if (band.total > 0) continue;
    const previous = zeroRanges.at(-1);
    if (previous !== undefined && previous.end === band.start) {
      previous.end = band.end;
    } else {
      zeroRanges.push({ start: band.start, end: band.end });
    }
  }
  if (zeroRanges.length === 0) {
    return 'Expected output continues across the full 0 to 600 metre chart.';
  }
  return zeroRanges
    .map(({ start, end }) =>
      `No expected output from ${formatWeaponNumber(start)} to ${formatWeaponNumber(end)} metres.`)
    .join(' ');
}

export function RangeDamageChart({
  catalog,
  weapon,
  mountedWeapons,
}: {
  catalog: Catalog;
  weapon: Weapon;
  mountedWeapons: readonly MountedWeaponProfile[];
}) {
  const id = useId().replaceAll(':', '');
  const weaponChart = weaponDamageChart(catalog, weapon);
  const loadoutChart = loadoutDamageChart(catalog, mountedWeapons);
  const mountCount = mountedWeapons.length;
  const belowMinimum = weapon.range.min > 0
    ? expectedWeaponDpsAtRange(catalog, weapon, Math.max(0, weapon.range.min - 0.001))
    : weaponChart.peak;
  const atMinimum = expectedWeaponDpsAtRange(catalog, weapon, weapon.range.min);
  const weaponDescription = weapon.range.min > 0
    ? `${weapon.name} falls to ${formatWeaponNumber(belowMinimum)} expected DPS inside ${weapon.range.min} metres, then rises to ${formatWeaponNumber(atMinimum)} DPS at its minimum-range boundary. Authored accuracy falloff is included; pilot, movement, cover, heat, and elevation modifiers are not.`
    : `${weapon.name} peaks at ${formatWeaponNumber(weaponChart.peak)} expected DPS. Authored accuracy falloff is included; pilot, movement, cover, heat, and elevation modifiers are not.`;
  const loadoutDescription = `Stacked output from ${mountCount} current mount${mountCount === 1 ? '' : 's'}${loadoutChart.series.length === 0 ? '' : `: ${loadoutChart.series.map((series) => `${series.label}${series.count > 1 ? ` times ${series.count}` : ''}`).join(', ')}`}. Peak output is ${formatWeaponNumber(loadoutChart.peak)} expected DPS. ${loadoutEnvelopeDescription(loadoutChart)} Pilot, movement, cover, heat, and elevation modifiers are not included.`;

  return (
    <section
      className="range-damage-chart"
      data-testid="range-damage-chart"
      data-range-maximum={RANGE_DAMAGE_MAX_METRES}
    >
      <p className="range-damage-chart__caption">
        <strong>Damage by range</strong>
        <span>expected DPS</span>
      </p>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        focusable="false"
        aria-labelledby={`${id}-weapon-title ${id}-weapon-desc`}
        data-chart="inspected"
        data-min-range={weapon.range.min}
      >
        <title id={`${id}-weapon-title`}>
          {`${weapon.name} expected damage by range, 0 to 600 metres`}
        </title>
        <desc id={`${id}-weapon-desc`}>{weaponDescription}</desc>
        <defs>
          <pattern id={`${id}-minimum-hatch`} width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M -1 1 L 1 -1 M 0 5 L 5 0 M 4 6 L 6 4" />
          </pattern>
        </defs>
        <PlotFrame />
        {weapon.range.min <= 0 ? null : (
          <>
            <rect
              className="range-damage-chart__minimum-zone"
              x={PLOT_LEFT}
              y={PLOT_TOP}
              width={chartX(Math.min(weapon.range.min, RANGE_DAMAGE_MAX_METRES)) - PLOT_LEFT}
              height={PLOT_BOTTOM - PLOT_TOP}
              fill={`url(#${id}-minimum-hatch)`}
              data-range-breakpoint="minimum"
              data-distance={weapon.range.min}
              aria-hidden="true"
            />
            <line
              className="range-damage-chart__minimum-boundary"
              x1={chartX(Math.min(weapon.range.min, RANGE_DAMAGE_MAX_METRES))}
              x2={chartX(Math.min(weapon.range.min, RANGE_DAMAGE_MAX_METRES))}
              y1={PLOT_TOP}
              y2={PLOT_BOTTOM}
              vectorEffect="non-scaling-stroke"
              aria-hidden="true"
            />
          </>
        )}
        {(['short', 'medium', 'long'] as const).map((band) => (
          <line
            key={band}
            className="range-damage-chart__breakpoint"
            x1={chartX(Math.min(weapon.range[band], RANGE_DAMAGE_MAX_METRES))}
            x2={chartX(Math.min(weapon.range[band], RANGE_DAMAGE_MAX_METRES))}
            y1={PLOT_TOP}
            y2={PLOT_BOTTOM}
            data-range-breakpoint={band}
            data-distance={weapon.range[band]}
            vectorEffect="non-scaling-stroke"
            aria-hidden="true"
          />
        ))}
        <WeaponBands weapon={weapon} bands={weaponChart.bands} peak={weaponChart.peak} />
        <Axis />
        <text className="range-damage-chart__row-label" x={PLOT_LEFT} y={10} aria-hidden="true">
          INSPECTED · {weapon.name.toUpperCase()}
        </text>
        <text className="range-damage-chart__peak" x={PLOT_RIGHT} y={10} aria-hidden="true">
          {formatWeaponNumber(weaponChart.peak)} PEAK
        </text>
        {weapon.range.min <= 0 ? null : (
          <text
            className="range-damage-chart__minimum-label"
            x={chartX(Math.min(weapon.range.min, RANGE_DAMAGE_MAX_METRES)) + 3}
            y={PLOT_TOP + 8}
            aria-hidden="true"
          >
            {weapon.range.min}m MIN
          </text>
        )}
      </svg>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        focusable="false"
        aria-labelledby={`${id}-loadout-title ${id}-loadout-desc`}
        data-chart="loadout"
      >
        <title id={`${id}-loadout-title`}>
          Current loadout expected damage by range, 0 to 600 metres
        </title>
        <desc id={`${id}-loadout-desc`}>{loadoutDescription}</desc>
        <PlotFrame />
        <LoadoutBands chart={loadoutChart} />
        <Axis />
        <text className="range-damage-chart__row-label" x={PLOT_LEFT} y={10} aria-hidden="true">
          CURRENT LOADOUT · {mountCount} MOUNT{mountCount === 1 ? '' : 'S'}
        </text>
        <text className="range-damage-chart__peak" x={PLOT_RIGHT} y={10} aria-hidden="true">
          {formatWeaponNumber(loadoutChart.peak)} PEAK
        </text>
      </svg>
    </section>
  );
}
