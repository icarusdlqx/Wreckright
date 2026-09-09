import { LOCATIONS, type MechLocation } from '../../schema/common';
import type { Chassis } from '../../schema/chassis';
import type { Faction } from '../../schema/faction';
import type { Loadout } from '../../sim/loadout';
import { MECH_LOCATION_NAMES } from './LocationCard';

/** A schematic keeps the construction locations fixed while the model remains a preview. */
export function AnatomyBackdrop({ faction }: { faction: Faction }) {
  return <svg className={`anatomical-backdrop is-${faction}`} viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
    <path className="anatomical-backdrop__body" d="M455 25h90l24 65-19 28 128 16 30 45 180 18 20 193-71 24-50-144-36-6-36 129-60 37 22 157-87 3-55-145h-70l-55 145-87-3 22-157-60-37-36-129-36 6-50 144-71-24 20-193 180-18 30-45 128-16-19-28z" />
    <path d="M500 114v304M316 164l94 52h180l94-52M355 388l92-48h106l92 48M405 440l-15 115M595 440l15 115" />
    <path className="anatomical-backdrop__axis" d="M500 0v600M50 315h900" />
  </svg>;
}

export function AnatomyNavigator({ chassis, loadout, selected, compatible, targeting, onSelect }: {
  chassis: Chassis;
  loadout: Loadout;
  selected: MechLocation | null;
  compatible: ReadonlySet<MechLocation>;
  targeting: boolean;
  onSelect: (location: MechLocation) => void;
}) {
  return <nav className="anatomical-navigator" aria-label="Complete mech fitting overview" data-testid="anatomical-navigator">
    <AnatomyBackdrop faction={chassis.faction} />
    {LOCATIONS.map(location => <button key={location} type="button" className={`loc-${location}`}
      aria-label={`Open ${MECH_LOCATION_NAMES[location]} rack`} aria-pressed={selected === location}
      data-fit={targeting ? compatible.has(location) : undefined}
      onClick={(event) => {
        onSelect(location);
        const bay = event.currentTarget.closest('[data-testid="mechbay"]');
        requestAnimationFrame(() => bay?.querySelector<HTMLElement>(`[data-testid="bay-location-${location}"]`)?.scrollIntoView({ block: 'center', behavior: 'instant' }));
      }}>
      <strong>{MECH_LOCATION_NAMES[location]}</strong>
      <span>{loadout.perLocation[location].slotsUsed}/{loadout.perLocation[location].slotsAvailable} boxes</span>
    </button>)}
  </nav>;
}
