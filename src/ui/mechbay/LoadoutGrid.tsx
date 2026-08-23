import { LOCATIONS, type MechLocation } from '../../schema/common';
import type { Chassis } from '../../schema/chassis';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import type { Loadout } from '../../sim/loadout';
import { LocationCard, MECH_LOCATION_NAMES, type DropPayload } from './LocationCard';
import './locationWorkbench.css';

interface Props {
  catalog: Catalog;
  chassis: Chassis;
  design: Design;
  loadout: Loadout;
  armed: DropPayload | null;
  selectedLocation: MechLocation | null;
  hoveredLocation: MechLocation | null;
  compatibleLocations: ReadonlySet<MechLocation>;
  onCancelArmed: () => void;
  onDrop: (payload: DropPayload, location: MechLocation) => void;
  onRemoveMount: (index: number) => void;
  onRemoveAmmo: (index: number) => void;
  onRemoveEquipment: (index: number) => void;
  onInspect: (payload: DropPayload) => void;
  onSelectLocation: (location: MechLocation) => void;
  onHoverLocation: (location: MechLocation | null) => void;
}

export function LoadoutGrid({
  catalog,
  chassis,
  design,
  loadout,
  armed,
  selectedLocation,
  hoveredLocation,
  compatibleLocations,
  onCancelArmed,
  onDrop,
  onRemoveMount,
  onRemoveAmmo,
  onRemoveEquipment,
  onInspect,
  onSelectLocation,
  onHoverLocation,
}: Props) {
  const heldName =
    armed?.kind === 'equipment'
      ? (catalog.equipment.get(armed.id)?.name ?? armed.id)
      : armed === null
        ? ''
        : `${catalog.weapons.get(armed.id)?.name ?? armed.id}${armed.kind === 'ammo' ? ' ammo' : ''}`;
  // Holding a part is the only progress this view can prove. A selected
  // location may be a pre-fit shelf filter or a post-fit review, while an
  // inspected occupant deliberately clears the selection. Keep those states
  // neutral instead of claiming the player has completed steps we cannot see.
  const currentStep = armed !== null ? 2 : null;
  const statusText = armed !== null
    ? `Step 2 of 3: holding ${heldName}. Choose a green location marked Fits held part.`
    : selectedLocation !== null
      ? `${MECH_LOCATION_NAMES[selectedLocation]} is selected as a shelf filter. Pick a compatible part, or inspect and remove fitted parts here.`
      : 'Ready to fit or review: pick a part from the shelf, select a location to filter, or inspect a fitted part.';

  return (
    <section
      className="bay-grid location-workbench"
      data-testid="bay-grid"
      aria-labelledby="location-workbench-title"
    >
      <header className="location-workbench__guide">
        <div>
          <span className="location-workbench__eyebrow">Loadout workbench</span>
          <h3 id="location-workbench-title">Fit parts in three steps</h3>
        </div>
        <ol className="location-fit-steps" aria-label="Part fitting steps">
          {[
            ['Pick', 'from shelf'],
            ['Place', 'in a green location'],
            ['Review', 'the fitted loadout'],
          ].map(([label, detail], index) => {
            const step = index + 1;
            return (
              <li
                key={label}
                className={
                  step === currentStep
                    ? 'current'
                    : currentStep !== null && step < currentStep
                      ? 'complete'
                      : ''
                }
                aria-current={step === currentStep ? 'step' : undefined}
              >
                <span>{step}</span>
                <strong>{label}</strong>
                <small>{detail}</small>
              </li>
            );
          })}
        </ol>
        <p className="location-workbench__status" role="status" aria-live="polite" data-testid="bay-fit-status">
          {statusText}
        </p>
      </header>
      {armed === null ? null : (
        <div className="bay-armed-banner" data-testid="bay-armed">
          <span>
            Holding <strong>{heldName}</strong> — choose a highlighted location.
          </span>
          <button
            type="button"
            onClick={onCancelArmed}
            data-testid="bay-armed-cancel"
            aria-label={`Cancel placement of ${heldName}`}
          >
            Put it back
          </button>
        </div>
      )}
      <div className="location-overview" aria-label="Machine locations">
        {LOCATIONS.map((location) => (
          <LocationCard
            key={location}
            catalog={catalog}
            chassis={chassis}
            design={design}
            location={location}
            usage={loadout.perLocation[location]}
            onDrop={onDrop}
            onRemoveMount={onRemoveMount}
            onRemoveAmmo={onRemoveAmmo}
            onRemoveEquipment={onRemoveEquipment}
            onInspect={onInspect}
            onSelect={onSelectLocation}
            onHover={onHoverLocation}
            selected={selectedLocation === location}
            hovered={hoveredLocation === location}
            compatible={compatibleLocations.has(location)}
            armed={armed}
          />
        ))}
      </div>
    </section>
  );
}
