import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Chassis } from '../../schema/chassis';
import type { MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { computeHeatProfile, computeLoadout, type HeatProfile, type Loadout } from '../../sim/loadout';
import { useDialogFocus } from '../useDialogFocus';
import { MechPreview } from './MechPreview';
import { MECH_LOCATION_NAMES } from './LocationCard';
import { variantAssembly } from './variantAssembly';

interface Props {
  catalog: Catalog;
  chassis: Chassis;
  design: Design;
  loadout: Loadout;
  heat: HeatProfile;
  selectedLocation: MechLocation | null;
  hoveredLocation: MechLocation | null;
  compatibleLocations: ReadonlySet<MechLocation>;
  onSelectLocation: (location: MechLocation) => void;
  onHoverLocation: (location: MechLocation | null) => void;
  onClose: () => void;
  returnFocus: () => HTMLElement | null;
}

export function MachineFocus({ catalog, chassis, design, loadout, heat, selectedLocation,
  hoveredLocation, compatibleLocations, onSelectLocation, onHoverLocation, onClose, returnFocus }: Props) {
  const root = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [showPrime, setShowPrime] = useState(false);
  useDialogFocus(root, close, onClose, returnFocus);
  const assembly = variantAssembly(catalog, design);
  const displayed = showPrime ? assembly.prime ?? design : design;
  const displayedLoadout = showPrime ? computeLoadout(catalog, displayed) : loadout;
  const displayedHeat = showPrime ? computeHeatProfile(catalog, displayed) : heat;
  const displayedAssembly = showPrime ? variantAssembly(catalog, displayed) : assembly;
  const focusedLocation = hoveredLocation ?? selectedLocation;
  return createPortal(<div className="machine-focus-backdrop" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section ref={root} className="machine-focus" role="dialog" aria-modal="true"
      aria-labelledby="machine-focus-title" data-testid="machine-focus">
      <header className="machine-focus__header">
        <div><span>{showPrime ? 'Original assembly' : 'Your fitted machine'}</span>
          <h2 id="machine-focus-title">{showPrime ? `${chassis.name} · Prime` : design.name}</h2>
          <p>{chassis.name} · {chassis.tonnage}t {chassis.class} · {chassis.role}</p></div>
        <button ref={close} type="button" onClick={onClose}>Return to fitting</button>
      </header>
      <div className="machine-focus__comparison" aria-label="Compare the fitted machine with Prime">
        <div className="machine-focus__switch">
          <button type="button" aria-pressed={!showPrime} onClick={() => setShowPrime(false)}
            data-testid="inspect-current">Current build</button>
          <button type="button" aria-pressed={showPrime} disabled={assembly.prime === null}
            onClick={() => setShowPrime(true)} data-testid="inspect-prime">Prime</button>
        </div>
        <span data-testid="inspect-changes">{assembly.changed
          ? `${assembly.additions} fitted / repositioned · ${assembly.removals} removed from Prime`
          : 'Weapon layout matches Prime'}</span>
      </div>
      <div className="machine-focus__stage" data-faction={chassis.faction} data-assembly={showPrime ? 'prime' : 'current'}>
        <MechPreview catalog={catalog} chassis={chassis} design={displayed}
          selected={showPrime ? null : selectedLocation} hovered={showPrime ? null : hoveredLocation}
          compatible={showPrime ? undefined : compatibleLocations}
          onHoverLocation={showPrime ? undefined : onHoverLocation}
          onSelectLocation={showPrime ? undefined : onSelectLocation} fitToMachine />
        <div className="machine-focus__readout">
          <span>{showPrime ? 'Original fit' : focusedLocation === null ? 'Live component layout' : 'Body zone'}</span>
          <strong>{showPrime ? 'Prime' : focusedLocation === null ? 'Complete chassis' : MECH_LOCATION_NAMES[focusedLocation]}</strong>
          <p>{displayedAssembly.foreignWeapons > 0
            ? `${displayedAssembly.foreignWeapons} ${displayedAssembly.foreignOrigin} ${displayedAssembly.foreignWeapons === 1 ? 'weapon keeps' : 'weapons keep'} the original finish. Adapter collars show the cross-faction fit.`
            : 'Mounted weapons match this faction’s construction. Select a body zone to locate its fitting grid.'}</p>
        </div>
      </div>
      <footer className="machine-focus__footer">
        <span><b>{displayedLoadout.freeTonnage.toFixed(1)}t</b> free</span>
        <span><b>{displayedLoadout.totalSlotsUsed}/{displayedLoadout.totalSlotsAvailable}</b> boxes used</span>
        <span><b>{displayedHeat.sustainable ? 'Stable' : `${(displayedHeat.secondsToShutdownRisk ?? 0).toFixed(0)}s`}</b> heat profile</span>
        <small>{showPrime ? 'Reference only. Your fitted build is unchanged.' : 'Save a named variant in the bay to use this layout in campaign and skirmish.'}</small>
      </footer>
    </section>
  </div>, document.body);
}
