import type { Catalog } from '../../schema/load';
import type { Weapon } from '../../schema/weapon';
import {
  formatWeaponNumber,
  normalisedWeaponMetrics,
  weaponMetricMaxima,
  weaponMetrics,
} from './weaponPresentation';

function Meter({
  label,
  value,
  maximum,
  fill,
  valueText,
  display,
  warning = false,
}: {
  label: 'Damage' | 'Reach' | 'Heat';
  value: number;
  maximum: number;
  fill: number;
  valueText: string;
  display: string;
  warning?: boolean;
}) {
  return (
    <span
      className={`weapon-card__meter${warning ? ' is-warning' : ''}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={maximum}
      aria-valuenow={value}
      aria-valuetext={valueText}
    >
      <span className="weapon-card__meter-label">{label}</span>
      <span className="weapon-card__meter-value">{display}</span>
      <span className="weapon-card__meter-track" aria-hidden="true">
        <span style={{ width: `${fill * 100}%` }} />
      </span>
    </span>
  );
}

export function WeaponMeters({ catalog, weapon }: { catalog: Catalog; weapon: Weapon }) {
  const metrics = weaponMetrics(weapon);
  const maxima = weaponMetricMaxima(catalog);
  const normalised = normalisedWeaponMetrics(weapon, maxima);
  const damage = formatWeaponNumber(metrics.damage);
  const reach = formatWeaponNumber(metrics.reach);
  const heat = formatWeaponNumber(metrics.heat);
  return (
    <span className="weapon-card__meters">
      <Meter
        label="Damage"
        value={metrics.damage}
        maximum={maxima.damage}
        fill={normalised.damage}
        valueText={`${damage} damage per second`}
        display={`${damage}/s`}
      />
      <Meter
        label="Reach"
        value={metrics.reach}
        maximum={maxima.reach}
        fill={normalised.reach}
        valueText={`${reach} metres`}
        display={`${reach}m`}
      />
      <Meter
        label="Heat"
        value={metrics.heat}
        maximum={maxima.heat}
        fill={normalised.heat}
        valueText={`${heat} heat per second; higher is hotter`}
        display={`${heat}/s`}
        warning
      />
    </span>
  );
}
