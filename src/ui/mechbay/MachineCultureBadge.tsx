import { useId } from 'react';
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
  expanded,
  onExpandedChange,
}: {
  faction: Faction;
  compact?: boolean;
  foreignComponents?: boolean;
  showFitGuide?: boolean;
  testId?: string;
  /** When present with onExpandedChange, folds the explanatory copy behind a disclosure. */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const culture = machineCulturePresentation(faction);
  const detailsId = useId();
  const disclosure = expanded !== undefined && onExpandedChange !== undefined;
  const details = (
    <>
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
    </>
  );
  return (
    <div
      className={`machine-culture ${culture.className}${compact ? ' machine-culture--compact' : ''}${disclosure ? ` machine-culture--disclosure${expanded ? '' : ' machine-culture--collapsed'}` : ''}`}
      data-faction={faction}
      data-testid={testId}
      role="group"
      aria-label={`Machine culture: ${culture.badgeLabel}`}
    >
      {disclosure ? (
        <div className="machine-culture__disclosure-header">
          <span className="machine-culture__badge">{culture.badgeLabel}</span>
          <button
            type="button"
            className="machine-culture__disclosure"
            data-testid="bay-culture-disclosure"
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={`${expanded ? 'Hide' : 'Show'} ${culture.badgeLabel} culture details`}
            onClick={() => onExpandedChange(!expanded)}
          >
            {expanded ? 'Hide details' : 'Details'}
          </button>
        </div>
      ) : (
        <span className="machine-culture__badge">{culture.badgeLabel}</span>
      )}
      {disclosure ? (
        <div id={detailsId} className="machine-culture__details" hidden={!expanded}>
          {details}
        </div>
      ) : details}
    </div>
  );
}
