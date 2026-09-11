import { useMemo } from 'react';
import { LOCATIONS, type MechLocation } from '../../schema/common';
import type { Chassis } from '../../schema/chassis';
import type { Loadout } from '../../sim/loadout';
import { MECH_LOCATION_NAMES } from './LocationCard';
import { projectChassisAnatomy } from './anatomyProjection';

/** The actual hull stays behind fixed fitting locations; it never changes placement rules. */
export function AnatomyBackdrop({ chassis }: { chassis: Chassis }) {
  const projection = useMemo(() => projectChassisAnatomy(chassis), [chassis]);
  const [x, y, width, height] = projection.viewBox.split(' ').map(Number) as [number, number, number, number];
  const scale = Math.min(1000 / width, 600 / height);
  return <svg className={`anatomical-backdrop is-${chassis.faction}`} viewBox="0 0 1000 600"
    preserveAspectRatio="xMidYMid meet" data-chassis={chassis.id} aria-hidden="true">
    <g transform={`translate(500 300) scale(${scale}) translate(${-x - width / 2} ${-y - height / 2})`}>
      {projection.pieces.map((piece, index) => <polygon key={index} className="anatomical-backdrop__body"
        data-location={piece.location ?? undefined} data-tone={piece.tone}
        points={piece.points.map(point => `${point.x},${point.y}`).join(' ')}
        vectorEffect="non-scaling-stroke" />)}
    </g>
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
    <AnatomyBackdrop chassis={chassis} />
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
