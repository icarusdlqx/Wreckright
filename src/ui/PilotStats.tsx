import type { Catalog } from '../schema/load';
import { sensorRangeFor, sightRangeFor } from '../sim/sensors';
import './pilotReadout.css';

/**
 * Enough of a pilot to rate them. Both the campaign's roster records and the
 * catalogue's authored pilots satisfy this, so every screen uses the same scale.
 */
export interface RateablePilot {
  gunnery: number;
  piloting: number;
  sensors: number;
  traits: string[];
}

export interface PilotStat {
  label: string;
  /** The actual trainable skill level, out of five. */
  score: number;
  /** What the number actually buys, in the units the player sees on the field. */
  effect: string;
}

const MAX_SKILL = 5;

/** The product of a pilot's specialities on one factor. */
function traitProduct(
  catalog: Catalog,
  pilot: RateablePilot,
  key: 'survivalFactor' | 'criticalChanceFactor' | 'accuracyFactor' | 'dissipationFactor',
): number {
  let factor = 1;
  for (const id of pilot.traits) {
    const trait = catalog.rules.pilotTraits.entries[id];
    if (trait !== undefined) factor *= trait[key];
  }
  return factor;
}

/** Only the three purchased skills belong on the skill scale. */
export function pilotStats(catalog: Catalog, pilot: RateablePilot): PilotStat[] {
  const combat = catalog.rules.combat;
  const base = combat.gunneryBase[pilot.gunnery - 1] ?? combat.gunneryBase[0] ?? 0.5;
  const accuracy = traitProduct(catalog, pilot, 'accuracyFactor');
  const shutdown = Math.max(0, 1 - pilot.piloting * catalog.rules.heat.pilotingOverrideFactor);
  const footing = Math.max(
    0,
    1 - pilot.piloting * catalog.rules.stability.pilotingResistFactor,
  );

  return [
    {
      label: 'Gunnery',
      score: pilot.gunnery,
      effect: `${Math.round(base * accuracy * 100)}% base hit chance`,
    },
    {
      label: 'Piloting',
      score: pilot.piloting,
      effect: `${Math.round(footing * 100)}% stability damage taken; ${Math.round(shutdown * 100)}% of base shutdown risk`,
    },
    {
      label: 'Sensors',
      score: pilot.sensors,
      effect: `${Math.round(sensorRangeFor(catalog.rules.sensors, pilot.sensors))}m sensor reach; ${Math.round(sightRangeFor(catalog.rules.sensors, pilot.sensors))}m base optics`,
    },
  ];
}

/** These are trait modifiers, not extra skills or a morale meter. */
export function pilotSpecialityEffects(catalog: Catalog, pilot: RateablePilot): string[] {
  const effects: string[] = [];
  for (const [key, label] of [
    ['criticalChanceFactor', 'critical-hit chance'],
    ['survivalFactor', 'fatality risk after mech loss'],
  ] as const) {
    const factor = traitProduct(catalog, pilot, key);
    if (factor !== 1) effects.push(`${factor > 1 ? '+' : '−'}${Math.round(Math.abs(factor - 1) * 100)}% ${label}`);
  }
  return effects;
}

export function PilotStats({
  catalog,
  pilot,
  compact = false,
  showEffects = true,
}: {
  catalog: Catalog;
  pilot: RateablePilot;
  compact?: boolean;
  showEffects?: boolean;
}) {
  const stats = pilotStats(catalog, pilot);
  const effects = pilotSpecialityEffects(catalog, pilot);

  return (
    <div className={`pilot-readout${compact ? ' is-compact' : ''}`}>
    <ul className={`pilot-stats native-skills ${compact ? 'compact' : ''}`} data-testid="pilot-stats" aria-label="Pilot skills out of five">
      {stats.map((stat) => (
        <li key={stat.label} title={`${stat.label} ${stat.score}/${MAX_SKILL} — ${stat.effect}`}>
          <span className="stat-label">{stat.label}</span>
          <span className="stat-pips" aria-hidden="true">
            {Array.from({ length: MAX_SKILL }, (_, index) => <i key={index} data-filled={index < stat.score} />)}
          </span>
          <span className="stat-score">{stat.score}/{MAX_SKILL}</span>
        </li>
      ))}
    </ul>
    {effects.length === 0 || compact || !showEffects ? null : <ul className="pilot-derived-effects" aria-label="Speciality effects">
      {effects.map((effect) => <li key={effect}>{effect}</li>)}
    </ul>}
    </div>
  );
}
