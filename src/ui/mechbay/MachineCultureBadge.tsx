import type { Faction } from '../../schema/faction';
import {
  CULTURE_FIT_GUIDE,
  machineCulturePresentation,
} from './machineCulturePresentation';
import './machineCultureBadge.css';

export function MachineCultureBadge({
  faction,
  compact = false,
  foreignComponents = false,
  showFitGuide = false,
  testId,
}: {
  faction: Faction;
  compact?: boolean;
  foreignComponents?: boolean;
  showFitGuide?: boolean;
  testId?: string;
}) {
  const culture = machineCulturePresentation(faction);
  return (
    <div
      className={`machine-culture ${culture.className}${compact ? ' machine-culture--compact' : ''}`}
      data-faction={faction}
      data-testid={testId}
      role="group"
      aria-label={`Machine culture: ${culture.badgeLabel}`}
    >
      <span className="machine-culture__badge">{culture.badgeLabel}</span>
      {compact ? null : (
        <span className="machine-culture__explanation">{culture.explanation}</span>
      )}
      {showFitGuide ? (
        <span className="machine-culture__fit-guide">{CULTURE_FIT_GUIDE}</span>
      ) : null}
      {foreignComponents ? (
        <span className="machine-culture__foreign-note" role="note">
          Mixed-pattern fit installed. Foreign components are allowed; mount, slots, tonnage, and
          stock still decide fit.
        </span>
      ) : null}
    </div>
  );
}
