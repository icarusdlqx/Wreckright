import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { Chassis } from '../../schema/chassis';
import { LOCATIONS, type MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import { isArmourUnderMedian } from './armourWorkbenchModel';
import { ChassisSilhouette } from './ChassisSilhouette';

const LOCATION_LABELS: Readonly<Record<MechLocation, string>> = {
  head: 'Head',
  centre_torso: 'Centre torso',
  left_torso: 'Left torso',
  right_torso: 'Right torso',
  left_arm: 'Left arm',
  right_arm: 'Right arm',
  left_leg: 'Left leg',
  right_leg: 'Right leg',
};

export const ARMOUR_DOLL_POSITIONS: Readonly<Record<MechLocation, Readonly<{
  x: number;
  y: number;
}>>> = {
  head: { x: 50, y: 9 },
  centre_torso: { x: 50, y: 31 },
  left_torso: { x: 27, y: 31 },
  right_torso: { x: 73, y: 31 },
  left_arm: { x: 15, y: 46 },
  right_arm: { x: 85, y: 46 },
  left_leg: { x: 38, y: 74 },
  right_leg: { x: 62, y: 74 },
};

const DRAG_PIXELS_PER_POINT = 4;
const WHEEL_PREVIEW_END_MS = 140;

export interface ArmourPaperDollProps {
  chassis: Chassis;
  design: Design;
  activeLocations: readonly MechLocation[];
  classMedians: Readonly<Partial<Record<MechLocation, number | null>>>;
  plateWeightTons: number;
  onPreview: (location: MechLocation, value: number) => void;
  onPreviewEnd: () => void;
}

interface PointerDrag {
  pointerId: number;
  location: MechLocation;
  startX: number;
  startValue: number;
  lastValue: number;
  changed: boolean;
}

interface WheelGesture {
  location: MechLocation;
  value: number;
  timer: ReturnType<typeof setTimeout>;
}

export function clampArmourValue(value: number, maximum: number): number {
  const finite = Number.isFinite(value) ? Math.round(value) : 0;
  return Math.max(0, Math.min(Math.max(0, maximum), finite));
}

export function armourValueFromHorizontalDrag(
  startValue: number,
  startX: number,
  currentX: number,
  maximum: number,
): number {
  const steps = Math.round((currentX - startX) / DRAG_PIXELS_PER_POINT);
  return clampArmourValue(startValue + steps, maximum);
}

export function armourValueFromWheel(
  currentValue: number,
  deltaY: number,
  maximum: number,
): number {
  if (deltaY === 0) return clampArmourValue(currentValue, maximum);
  return clampArmourValue(currentValue + (deltaY < 0 ? 1 : -1), maximum);
}

function isMechLocation(value: string | undefined): value is MechLocation {
  return value !== undefined && LOCATIONS.some((location) => location === value);
}

/**
 * The silhouette supplies orientation while native controls own every action,
 * keeping the drawing itself out of the keyboard and accessibility trees.
 */
export function ArmourPaperDoll({
  chassis,
  design,
  activeLocations,
  classMedians,
  plateWeightTons,
  onPreview,
  onPreviewEnd,
}: ArmourPaperDollProps) {
  const activeSet = new Set(activeLocations);
  const active = LOCATIONS.filter((location) => activeSet.has(location));
  const underArmoured = new Set(active.filter((location) =>
    isArmourUnderMedian(design.armour[location], classMedians[location] ?? null)));
  const activeKey = active.join('|');
  const [selected, setSelected] = useState<MechLocation | null>(active[0] ?? null);
  const effectiveSelected = selected !== null && activeSet.has(selected)
    ? selected
    : active[0] ?? null;
  const sliderId = useId();
  const locationLayerRef = useRef<HTMLDivElement>(null);
  const pointerDragRef = useRef<PointerDrag | null>(null);
  const wheelGestureRef = useRef<WheelGesture | null>(null);
  const rangeGestureRef = useRef(false);

  useEffect(() => {
    if (selected !== effectiveSelected) setSelected(effectiveSelected);
  }, [activeKey, effectiveSelected, selected]);

  const finishWheelGesture = (): void => {
    const gesture = wheelGestureRef.current;
    if (gesture === null) return;
    clearTimeout(gesture.timer);
    wheelGestureRef.current = null;
    onPreviewEnd();
  };

  const previewWheel = (location: MechLocation, deltaY: number): void => {
    if (pointerDragRef.current !== null) return;
    const pending = wheelGestureRef.current;
    if (pending !== null && pending.location !== location) finishWheelGesture();

    const current = wheelGestureRef.current?.location === location
      ? wheelGestureRef.current.value
      : design.armour[location];
    const next = armourValueFromWheel(current, deltaY, chassis.armourMax[location]);
    if (next === current) return;

    const previousTimer = wheelGestureRef.current?.timer;
    if (previousTimer !== undefined) clearTimeout(previousTimer);
    onPreview(location, next);
    const timer = globalThis.setTimeout(() => {
      if (wheelGestureRef.current?.timer !== timer) return;
      wheelGestureRef.current = null;
      onPreviewEnd();
    }, WHEEL_PREVIEW_END_MS);
    wheelGestureRef.current = { location, value: next, timer };
  };

  useEffect(() => {
    const layer = locationLayerRef.current;
    if (layer === null) return undefined;
    const onWheel = (event: WheelEvent): void => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-armour-doll-location]')
        : null;
      if (target === null || !layer.contains(target)) return;
      const location = target.dataset.armourDollLocation;
      if (!isMechLocation(location) || !activeSet.has(location)) return;
      event.preventDefault();
      setSelected(location);
      previewWheel(location, event.deltaY);
    };
    layer.addEventListener('wheel', onWheel, { passive: false });
    const finishBeforeAnotherGesture = (): void => finishWheelGesture();
    document.addEventListener('pointerdown', finishBeforeAnotherGesture, true);
    document.addEventListener('keydown', finishBeforeAnotherGesture, true);
    return () => {
      layer.removeEventListener('wheel', onWheel);
      document.removeEventListener('pointerdown', finishBeforeAnotherGesture, true);
      document.removeEventListener('keydown', finishBeforeAnotherGesture, true);
    };
  }, [activeKey, chassis, design, onPreview, onPreviewEnd]);

  useEffect(() => () => {
    const gesture = wheelGestureRef.current;
    if (gesture !== null) clearTimeout(gesture.timer);
  }, []);

  const beginPointerDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    location: MechLocation,
  ): void => {
    if (event.button !== 0) return;
    finishWheelGesture();
    setSelected(location);
    const value = design.armour[location];
    pointerDragRef.current = {
      pointerId: event.pointerId,
      location,
      startX: event.clientX,
      startValue: value,
      lastValue: value,
      changed: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continuePointerDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = pointerDragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const next = armourValueFromHorizontalDrag(
      drag.startValue,
      drag.startX,
      event.clientX,
      chassis.armourMax[drag.location],
    );
    if (next === drag.lastValue) return;
    drag.lastValue = next;
    drag.changed = true;
    onPreview(drag.location, next);
  };

  const finishPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = pointerDragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    pointerDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.changed) onPreviewEnd();
  };

  const finishRangeGesture = (): void => {
    if (!rangeGestureRef.current) return;
    rangeGestureRef.current = false;
    onPreviewEnd();
  };

  const selectedValue = effectiveSelected === null ? 0 : design.armour[effectiveSelected];
  const selectedMaximum = effectiveSelected === null ? 0 : chassis.armourMax[effectiveSelected];
  const selectedMedian = effectiveSelected === null ? undefined : classMedians[effectiveSelected];
  const selectedBelowMedian = isArmourUnderMedian(selectedValue, selectedMedian ?? null);

  return (
    <section
      className="armour-paper-doll"
      data-testid="armour-paper-doll"
      data-frame={chassis.frame}
    >
      <div className="armour-paper-doll__stage">
        <div className="armour-paper-doll__silhouette" aria-hidden="true" inert>
          <ChassisSilhouette
            chassis={chassis}
            design={design}
            active={effectiveSelected}
            underArmoured={underArmoured}
          />
        </div>
        <div
          ref={locationLayerRef}
          className="armour-paper-doll__locations"
          role="group"
          aria-label="Armour locations"
        >
          {active.map((location) => {
            const value = design.armour[location];
            const maximum = chassis.armourMax[location];
            const median = classMedians[location];
            const belowMedian = isArmourUnderMedian(value, median ?? null);
            const position = ARMOUR_DOLL_POSITIONS[location];
            const style: CSSProperties = {
              left: `${position.x}%`,
              top: `${position.y}%`,
            };
            return (
              <button
                key={location}
                type="button"
                className={`armour-paper-doll__location${belowMedian ? ' armour-paper-doll__location--below-median' : ''}`}
                style={style}
                aria-pressed={effectiveSelected === location}
                aria-label={`${LOCATION_LABELS[location]}, ${value} of ${maximum} armour${belowMedian ? ', below class median' : ''}`}
                data-testid={`armour-doll-${location}`}
                data-armour-doll-location={location}
                data-below-class-median={belowMedian}
                data-position-x={position.x}
                data-position-y={position.y}
                onClick={() => setSelected(location)}
                onPointerDown={(event) => beginPointerDrag(event, location)}
                onPointerMove={continuePointerDrag}
                onPointerUp={finishPointerDrag}
                onPointerCancel={finishPointerDrag}
                onLostPointerCapture={finishPointerDrag}
              >
                <span className="armour-paper-doll__location-label">{LOCATION_LABELS[location]}</span>
                <span className="armour-paper-doll__location-value">{value}/{maximum}</span>
                {belowMedian ? (
                  <span className="armour-paper-doll__location-status">Below class median</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {effectiveSelected === null ? null : (
        <div
          className="armour-paper-doll__editor"
          data-location={effectiveSelected}
          data-below-class-median={selectedBelowMedian}
        >
          <label htmlFor={sliderId} className="armour-paper-doll__slider-label">
            <span>{LOCATION_LABELS[effectiveSelected]} armour</span>
            <output htmlFor={sliderId}>{selectedValue}/{selectedMaximum}</output>
            {selectedBelowMedian ? <span>Below class median</span> : null}
          </label>
          <input
            id={sliderId}
            className="armour-paper-doll__slider"
            type="range"
            min={0}
            max={selectedMaximum}
            value={selectedValue}
            aria-label={`${LOCATION_LABELS[effectiveSelected]} armour`}
            aria-valuetext={`${selectedValue} of ${selectedMaximum} armour${selectedBelowMedian ? ', below class median' : ''}; total plating ${plateWeightTons.toFixed(1)} tons`}
            data-testid="armour-doll-slider"
            data-history-transaction="armour"
            onChange={(event) => {
              finishWheelGesture();
              rangeGestureRef.current = true;
              onPreview(
                effectiveSelected,
                clampArmourValue(Number(event.target.value), selectedMaximum),
              );
            }}
            onBlur={finishRangeGesture}
            onKeyUp={finishRangeGesture}
            onPointerUp={finishRangeGesture}
            onPointerCancel={finishRangeGesture}
          />
        </div>
      )}
    </section>
  );
}
