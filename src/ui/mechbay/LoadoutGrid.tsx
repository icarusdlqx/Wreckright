import { useState } from 'react';
import type { MechLocation } from '../../schema/common';
import type { Chassis } from '../../schema/chassis';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import type { Loadout } from '../../sim/loadout';
import type { LocationFit } from './autoFit';
import { LocationCard, MECH_LOCATION_NAMES, type DropPayload } from './LocationCard';
import { partitionLocations } from './locationLayout';
import { LocationStrip } from './LocationStrip';
import './locationWorkbench.css';

interface Props {
  catalog: Catalog;
  chassis: Chassis;
  design: Design;
  loadout: Loadout;
  armed: DropPayload | null;
  targeting: DropPayload | null;
  guideExpanded: boolean;
  snapLocation: MechLocation | null;
  snapTarget: DropPayload | null;
  snapPhase: 0 | 1 | 2;
  selectedLocation: MechLocation | null;
  hoveredLocation: MechLocation | null;
  compatibleLocations: ReadonlySet<MechLocation>;
  locationFits: ReadonlyMap<MechLocation, LocationFit>;
  onCancelArmed: () => void;
  onGuideExpandedChange: (expanded: boolean) => void;
  onAutoFit: (payload: DropPayload) => void;
  onDrop: (payload: DropPayload, location: MechLocation) => void;
  onRemoveMount: (index: number) => void;
  onRemoveAmmo: (index: number) => void;
  onRemoveEquipment: (index: number) => void;
  onSwapMount?: (index: number) => void;
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
  targeting,
  guideExpanded,
  snapLocation,
  snapTarget,
  snapPhase,
  selectedLocation,
  hoveredLocation,
  compatibleLocations,
  locationFits,
  onCancelArmed,
  onGuideExpandedChange,
  onAutoFit,
  onDrop,
  onRemoveMount,
  onRemoveAmmo,
  onRemoveEquipment,
  onSwapMount,
  onInspect,
  onSelectLocation,
  onHoverLocation,
}: Props) {
  const [showAllLocations, setShowAllLocations] = useState(false);
  const layout = partitionLocations(chassis, design, {
    selected: selectedLocation,
    targeting: (targeting ?? armed) !== null,
    compatible: compatibleLocations,
    showAll: showAllLocations,
  });
  const targetName =
    targeting?.kind === 'equipment'
      ? (catalog.equipment.get(targeting.id)?.name ?? targeting.id)
      : targeting === null
        ? ''
        : `${catalog.weapons.get(targeting.id)?.name ?? targeting.id}${targeting.kind === 'ammo' ? ' ammo' : ''}`;
  const currentStep = targeting !== null ? 2 : null;
  const statusText = targeting !== null
    ? `${armed === null ? `Dragging ${targetName}` : `Step 2 of 3: holding ${targetName}`}. Targeting details revealed; choose a green location marked Fits held part.`
    : selectedLocation !== null
      ? `${MECH_LOCATION_NAMES[selectedLocation]} is selected as a shelf filter. Pick a compatible part, or inspect and remove fitted parts here.`
      : 'Ready to fit or review: pick a part from the shelf, select a location to filter, or inspect a fitted part.';

  return (
    <section
      className="bay-grid location-workbench"
      data-testid="bay-grid"
      aria-labelledby="location-workbench-title"
    >
      <header className={`location-workbench__guide ${guideExpanded ? 'is-expanded' : 'is-folded'}`}>
        <div className="location-workbench__heading">
          <span className="location-workbench__eyebrow">Loadout workbench</span>
          <h3 id="location-workbench-title">Fit parts in three steps</h3>
        </div>
        <button
          type="button"
          className="location-workbench__disclosure"
          data-testid="bay-workbench-disclosure"
          aria-expanded={guideExpanded}
          aria-controls="location-fit-steps"
          onClick={() => onGuideExpandedChange(!guideExpanded)}
        >
          {guideExpanded ? 'Hide guide' : 'Show guide'}
        </button>
        <ol
          id="location-fit-steps"
          className="location-fit-steps"
          aria-label="Part fitting steps"
          hidden={!guideExpanded}
        >
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
            Holding <strong>{targetName}</strong> — choose a highlighted location.
          </span>
          <button
            type="button"
            className="bay-armed-fit"
            onClick={() => onAutoFit(armed)}
            data-testid="bay-armed-autofit"
            aria-label={`Fit ${targetName} in the best location`}
          >
            Fit it for me
          </button>
          <button
            type="button"
            onClick={onCancelArmed}
            data-testid="bay-armed-cancel"
            aria-label={`Cancel placement of ${targetName}`}
          >
            Put it back
          </button>
        </div>
      )}
      <div className="location-overview" aria-label="Machine locations">
        {layout.full.map((location) => (
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
            onSwapMount={onSwapMount}
            onInspect={onInspect}
            onSelect={onSelectLocation}
            onHover={onHoverLocation}
            selected={selectedLocation === location}
            hovered={hoveredLocation === location}
            compatible={compatibleLocations.has(location)}
            refusal={locationFits.get(location)?.reason ?? null}
            armed={armed}
            targeting={targeting}
            snapTarget={snapTarget}
            snapPhase={snapLocation === location ? snapPhase : 0}
          />
        ))}
      </div>
      <LocationStrip
        chassis={chassis}
        design={design}
        loadout={loadout}
        locations={layout.compact}
        armed={armed}
        targeting={targeting}
        compatibleLocations={compatibleLocations}
        locationFits={locationFits}
        showAll={showAllLocations}
        onShowAllChange={setShowAllLocations}
        onSelect={onSelectLocation}
        onDrop={onDrop}
        onHover={onHoverLocation}
      />
    </section>
  );
}
