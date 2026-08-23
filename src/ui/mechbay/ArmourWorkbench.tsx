import { useEffect, useState } from 'react';
import type { Chassis } from '../../schema/chassis';
import type { MechLocation } from '../../schema/common';
import { TORSO_LOCATIONS, type Design, type TorsoLocation } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { armourFacesForDesign } from '../../sim/designArmour';
import type { Loadout } from '../../sim/loadout';
import {
  applyRearArmourPreset,
  applyRememberedArmourPosture,
  designArmourLocations,
  selectedRearArmourPreset,
  setLocationPaidArmour,
  setPaidArmourTotal,
  setTorsoRearArmour,
  spendRemainingTonnage,
} from './armourWorkbenchModel';
import './armourWorkbench.css';

const LOCATION_LABELS: Record<MechLocation, string> = {
  head: 'Head',
  centre_torso: 'Centre torso',
  left_torso: 'Left torso',
  right_torso: 'Right torso',
  left_arm: 'Left arm',
  right_arm: 'Right arm',
  left_leg: 'Left leg',
  right_leg: 'Right leg',
};

const PRESET_TRADEOFFS: Readonly<Record<string, string>> = {
  front_facing: 'More protection toward the enemy; thinner if flanked.',
  balanced: 'A steady compromise when threats may come from either side.',
  rear_guard: 'More protection while withdrawing; less plate faces ahead.',
};

function isTorso(location: MechLocation): location is TorsoLocation {
  return TORSO_LOCATIONS.includes(location as TorsoLocation);
}

export function armourPreviewEndHandlers(onEnd: () => void) {
  return {
    onBlur: onEnd,
    onKeyUp: onEnd,
    onPointerUp: onEnd,
    onPointerCancel: onEnd,
  };
}

export function ArmourWorkbench({
  catalog,
  chassis,
  design,
  loadout,
  onApply,
  onPreview = onApply,
  onPreviewEnd = () => undefined,
}: {
  catalog: Catalog;
  chassis: Chassis;
  design: Design;
  loadout: Loadout;
  onApply: (design: Design) => void;
  onPreview?: (design: Design) => void;
  onPreviewEnd?: () => void;
}) {
  const active = designArmourLocations(catalog, design);
  const activeSet = new Set(active);
  const armourMaximum = active.reduce(
    (sum, location) => sum + chassis.armourMax[location],
    0,
  );
  const activeTorsos = TORSO_LOCATIONS.filter((location) => activeSet.has(location));
  const torsoFaces = activeTorsos.map((location) =>
    armourFacesForDesign(catalog.rules.construction, design, location));
  const torsoFront = torsoFaces.reduce((sum, faces) => sum + faces.front, 0);
  const torsoRear = torsoFaces.reduce((sum, faces) => sum + faces.rear, 0);
  const selectedPreset = selectedRearArmourPreset(catalog, design);
  const [postureIntent, setPostureIntent] = useState<string | null>(selectedPreset);
  useEffect(() => {
    if (selectedPreset !== null) setPostureIntent(selectedPreset);
  }, [design.chassisId, selectedPreset]);
  const withPosture = (next: Design): Design =>
    applyRememberedArmourPosture(catalog, next, postureIntent);
  const applyWithPosture = (next: Design): void => onApply(withPosture(next));
  const previewWithPosture = (next: Design): void => onPreview(withPosture(next));
  const previewEnd = armourPreviewEndHandlers(onPreviewEnd);

  return (
    <section
      className="armour-workbench"
      aria-labelledby="armour-workbench-title"
      data-testid="armour-workbench"
    >
      <header className="armour-workbench__header">
        <div>
          <h4 id="armour-workbench-title">Armour</h4>
          <p>
            <strong>{loadout.armourPoints}/{armourMaximum}</strong> paid points ·{' '}
            <strong>{loadout.armourWeight.toFixed(1)}t</strong>
          </p>
        </div>
        <button
          type="button"
          className="armour-workbench__maximise"
          onClick={() => applyWithPosture(spendRemainingTonnage(catalog, design))}
          data-testid="max-armour"
        >
          Spend remaining tonnage on armour
        </button>
      </header>

      <label className="armour-workbench__total" htmlFor="armour-paid-total">
        <span>Total paid armour</span>
        <output htmlFor="armour-paid-total">{loadout.armourPoints} points</output>
        <input
          id="armour-paid-total"
          type="range"
          min={0}
          max={armourMaximum}
          value={loadout.armourPoints}
          aria-valuetext={`${loadout.armourPoints} points, ${loadout.armourWeight.toFixed(1)} tons`}
          onChange={(event) =>
            previewWithPosture(setPaidArmourTotal(catalog, design, Number(event.target.value)))}
          {...previewEnd}
          data-history-transaction="armour"
          data-testid="armour-total"
        />
      </label>

      <fieldset className="armour-workbench__presets">
        <legend>Protection posture</legend>
        <div className="armour-workbench__preset-grid">
          {catalog.rules.construction.rearArmour.presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={postureIntent === preset.id}
              onClick={() => {
                setPostureIntent(preset.id);
                onApply(applyRearArmourPreset(catalog, design, preset.id));
              }}
              data-testid={`armour-preset-${preset.id}`}
            >
              <strong>{preset.label}</strong>
              <span>{PRESET_TRADEOFFS[preset.id] ?? 'A different front and rear emphasis.'}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <dl className="armour-workbench__faces" aria-label="Torso armour split">
        <div>
          <dt>Torso front</dt>
          <dd data-testid="torso-front-total">{torsoFront} points</dd>
        </div>
        <div>
          <dt>Torso rear</dt>
          <dd data-testid="torso-rear-total">{torsoRear} points</dd>
        </div>
      </dl>

      <details className="armour-workbench__advanced" data-testid="armour-detail">
        <summary>Advanced location armour</summary>
        <p>Rear controls move existing torso plate; they never change paid armour.</p>
        <div className="armour-workbench__locations">
          {active.map((location) => {
            const label = LOCATION_LABELS[location];
            const total = design.armour[location];
            const faces = armourFacesForDesign(catalog.rules.construction, design, location);
            return (
              <div className="armour-workbench__location" key={location}>
                <label htmlFor={`armour-paid-${location}`}>
                  <span>{label}</span>
                  <output htmlFor={`armour-paid-${location}`}>
                    {total}/{chassis.armourMax[location]}
                  </output>
                </label>
                <input
                  id={`armour-paid-${location}`}
                  type="range"
                  min={0}
                  max={chassis.armourMax[location]}
                  value={total}
                  aria-label={`${label} paid armour`}
                  aria-valuetext={`${total} of ${chassis.armourMax[location]} points`}
                  onChange={(event) =>
                    previewWithPosture(setLocationPaidArmour(
                      catalog,
                      design,
                      location,
                      Number(event.target.value),
                    ))}
                  {...previewEnd}
                  data-history-transaction="armour"
                  data-testid={`armour-${location}`}
                />
                {isTorso(location) ? (
                  <div className="armour-workbench__rear">
                    <label htmlFor={`armour-rear-${location}`}>
                      <span>Rear allocation</span>
                      <output htmlFor={`armour-rear-${location}`}>
                        {faces.rear} rear / {faces.front} front
                      </output>
                    </label>
                    <input
                      id={`armour-rear-${location}`}
                      type="range"
                      min={0}
                      max={total}
                      value={faces.rear}
                      disabled={total === 0}
                      aria-label={`${label} rear armour`}
                      aria-valuetext={`${faces.rear} rear, ${faces.front} front; ${total} total`}
                      onChange={(event) => {
                        setPostureIntent(null);
                        onPreview(setTorsoRearArmour(
                          catalog,
                          design,
                          location,
                          Number(event.target.value),
                        ));
                      }}
                      {...previewEnd}
                      data-history-transaction="armour"
                      data-testid={`rear-armour-${location}`}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </details>
    </section>
  );
}
