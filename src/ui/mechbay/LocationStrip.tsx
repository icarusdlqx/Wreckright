import type { Chassis } from '../../schema/chassis';
import type { MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import type { Loadout } from '../../sim/loadout';
import type { LocationFit } from './autoFit';
import { MECH_LOCATION_NAMES, type DropPayload } from './LocationCard';
import './locationStrip.css';

interface Props {
  chassis: Chassis;
  design: Design;
  loadout: Loadout;
  locations: readonly MechLocation[];
  armed: DropPayload | null;
  targeting: DropPayload | null;
  compatibleLocations: ReadonlySet<MechLocation>;
  locationFits: ReadonlyMap<MechLocation, LocationFit>;
  showAll: boolean;
  onShowAllChange: (show: boolean) => void;
  onSelect: (location: MechLocation) => void;
  onDrop: (payload: DropPayload, location: MechLocation) => void;
  onHover: (location: MechLocation | null) => void;
}

/**
 * The locations that only ever hold gear and ammunition, folded into one line
 * beneath the grid. Each entry still takes a drop and a click, so nothing the
 * full card could do is lost — it is just not paid for until it is wanted.
 */
export function LocationStrip({
  chassis,
  design,
  loadout,
  locations,
  armed,
  targeting,
  compatibleLocations,
  locationFits,
  showAll,
  onShowAllChange,
  onSelect,
  onDrop,
  onHover,
}: Props) {
  if (locations.length === 0 && !showAll) return null;
  const target = targeting ?? armed;

  return (
    <div className="location-strip" data-testid="bay-location-strip">
      {locations.length === 0 ? null : (
        <ul className="location-strip__list" aria-label="Locations without weapon mounts">
          {locations.map((location) => {
            const name = MECH_LOCATION_NAMES[location];
            const usage = loadout.perLocation[location];
            const free = Math.max(0, usage.slotsAvailable - usage.slotsUsed);
            const compatible = target !== null && compatibleLocations.has(location);
            const refusal = target === null || compatible
              ? null
              : (locationFits.get(location)?.reason ?? null);
            const armour = `${design.armour[location]}/${chassis.armourMax[location]}`;
            return (
              <li key={location}>
                <button
                  type="button"
                  className={`location-strip__item${compatible ? ' is-compatible' : ''}`}
                  data-testid={`bay-location-compact-${location}`}
                  disabled={armed !== null && !compatible}
                  title={refusal ?? undefined}
                  aria-label={`${name}: ${free} slot${free === 1 ? '' : 's'} free, armour ${armour}${refusal === null ? '' : `, ${refusal}`}. Expand to a full card.`}
                  onPointerEnter={() => onHover(location)}
                  onPointerLeave={() => onHover(null)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'copy';
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const raw = event.dataTransfer.getData('application/wreckright');
                    if (raw === '') return;
                    onDrop(JSON.parse(raw) as DropPayload, location);
                  }}
                  onClick={() => {
                    if (armed !== null) {
                      if (compatible) onDrop(armed, location);
                      return;
                    }
                    onSelect(location);
                  }}
                >
                  <strong>{name}</strong>
                  <span>{free} slot{free === 1 ? '' : 's'}</span>
                  <span className="location-strip__armour">Armour {armour}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {locations.length === 0 ? null : (
        <span className="location-strip__note">Gear and ammo only</span>
      )}
      <button
        type="button"
        className="location-strip__toggle"
        data-testid="bay-locations-toggle"
        aria-pressed={showAll}
        onClick={() => onShowAllChange(!showAll)}
      >
        {showAll ? 'Show fewer locations' : 'Show all locations'}
      </button>
    </div>
  );
}
