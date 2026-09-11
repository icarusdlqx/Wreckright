import type { Catalog } from '../schema/load';
import { abilityIdFor } from '../sim/abilities';
import type { RateablePilot } from './PilotStats';
import './pilotReadout.css';

/** Match the field's first-speciality rule, including its default ability. */
export function pilotAbilitySummary(catalog: Catalog, pilot: Pick<RateablePilot, 'traits'>) {
  const id = abilityIdFor(catalog.rules.abilities, pilot.traits);
  const ability = catalog.rules.abilities.entries[id];
  if (ability === undefined) return null;
  const effects: string[] = [];
  for (const [factor, label] of [
    [ability.accuracyFactor, 'accuracy'], [ability.incomingAccuracyFactor, 'enemy accuracy'],
    [ability.speedFactor, 'speed'], [ability.sensorRangeFactor, 'sensor range'],
    [ability.damageTakenFactor, 'damage taken'], [ability.stabilityFactor, 'stability damage'],
  ] as const) {
    if (factor !== 1) effects.push(`${factor > 1 ? '+' : '−'}${Math.round(Math.abs(factor - 1) * 100)}% ${label}`);
  }
  if (ability.heatShedFraction > 0) effects.push(`Sheds ${Math.round(ability.heatShedFraction * 100)}% current heat`);
  return { id, label: ability.label, note: ability.note, effects,
    timing: `${ability.durationSeconds > 0 ? `${ability.durationSeconds}s effect` : 'Instant'} · ${catalog.rules.abilities.cooldownSeconds}s recharge` };
}

export function PilotAbilityReadout({ catalog, pilot, compact = false }: {
  catalog: Catalog;
  pilot: Pick<RateablePilot, 'traits'>;
  compact?: boolean;
}) {
  const ability = pilotAbilitySummary(catalog, pilot);
  if (ability === null) return null;
  return <div className={`pilot-ability-readout${compact ? ' is-compact' : ''}`} data-testid="pilot-ability-readout">
    <span>Pilot ability</span><strong>{ability.label}</strong>
    <p>{ability.effects.join(' · ')}</p><small>{ability.timing}</small>
  </div>;
}
