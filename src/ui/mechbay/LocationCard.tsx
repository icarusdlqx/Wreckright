import type { Chassis } from '../../schema/chassis';
import type { MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { armourFacesForDesign } from '../../sim/designArmour';
import { weaponSizeLabel, type LocationUsage } from '../../sim/loadout';
import { buildLocationOccupants, type LocationOccupant } from './locationOccupants';

export const MECH_LOCATION_NAMES: Record<MechLocation, string> = {
  head: 'Head',
  centre_torso: 'Centre Torso',
  left_torso: 'Left Torso',
  right_torso: 'Right Torso',
  left_arm: 'Left Arm',
  right_arm: 'Right Arm',
  left_leg: 'Left Leg',
  right_leg: 'Right Leg',
};

export interface DropPayload {
  kind: 'weapon' | 'equipment' | 'ammo';
  id: string;
}

export function mutateAfterStableFocus(
  focusTarget: Pick<HTMLElement, 'focus'> | null,
  mutate: () => void,
): void {
  focusTarget?.focus({ preventScroll: true });
  mutate();
}

export function stableRemovalFocusTarget(removeControl: HTMLElement): HTMLButtonElement | null {
  const ownLocation = removeControl
    .closest('.bay-location')
    ?.querySelector<HTMLButtonElement>('.bay-location-name') ?? null;
  if (ownLocation !== null && !ownLocation.disabled) return ownLocation;

  const mechbay = removeControl.closest('[data-testid="mechbay"]');
  return mechbay?.querySelector<HTMLButtonElement>(
    '.bay-location.selected .bay-location-name:not(:disabled)',
  ) ?? mechbay?.querySelector<HTMLButtonElement>('.bay-location-name:not(:disabled)')
    ?? mechbay?.querySelector<HTMLButtonElement>('[data-workspace-tab][aria-selected="true"]')
    ?? mechbay?.querySelector<HTMLButtonElement>('[data-testid="bay-exit"]')
    ?? null;
}

/** One consistently sized cell per slot makes footprints comparable across locations. */
function RackCells({ count, incoming = 0 }: { count: number; incoming?: number }) {
  return (
    <span className="rack-cells" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <i
          key={index}
          className={`rack-cell${index < incoming ? ' rack-cell--incoming' : ''}`}
        />
      ))}
    </span>
  );
}

function armedFootprint(catalog: Catalog, armed: DropPayload | null): number {
  if (armed === null) return 0;
  if (armed.kind === 'weapon') return catalog.weapons.get(armed.id)?.slots ?? 1;
  if (armed.kind === 'equipment') return catalog.equipment.get(armed.id)?.slots ?? 1;
  // A bin is always one slot per ton, placed a ton at a time.
  return 1;
}

interface Props {
  catalog: Catalog;
  chassis: Chassis;
  design: Design;
  location: MechLocation;
  usage: LocationUsage;
  onDrop: (payload: DropPayload, location: MechLocation) => void;
  onRemoveMount: (index: number) => void;
  onRemoveAmmo: (index: number) => void;
  onRemoveEquipment: (index: number) => void;
  onInspect?: (payload: DropPayload) => void;
  onSelect?: (location: MechLocation) => void;
  onHover?: (location: MechLocation | null) => void;
  selected?: boolean;
  hovered?: boolean;
  compatible?: boolean;
  refusal?: string | null;
  /** Touch placement keeps a picked part armed until a location accepts it. */
  armed?: DropPayload | null;
  targeting?: DropPayload | null;
  snapTarget?: DropPayload | null;
  snapPhase?: 0 | 1 | 2;
}

export function LocationCard({
  catalog,
  chassis,
  design,
  location,
  usage,
  onDrop,
  onRemoveMount,
  onRemoveAmmo,
  onRemoveEquipment,
  onInspect,
  onSelect,
  onHover,
  selected = false,
  hovered = false,
  compatible = false,
  refusal = null,
  armed = null,
  targeting = null,
  snapTarget = null,
  snapPhase = 0,
}: Props) {
  const hardpoints = chassis.hardpoints[location];
  const slotsOver = usage.slotsUsed > usage.slotsAvailable;

  const overHardpointTypes = (['energy', 'ballistic', 'missile'] as const).filter(
    (type) => usage.hardpointsUsed[type] > usage.hardpointsAvailable[type],
  );
  const hardpointOver = overHardpointTypes.length > 0;

  const { occupants, sizeOver } = buildLocationOccupants(catalog, design, location, usage.size);

  const filled = occupants.reduce((total, item) => total + item.slots, 0);
  const empty = Math.max(0, usage.slotsAvailable - filled);
  let snapOccupantKey: string | null = null;
  if (snapPhase !== 0 && snapTarget !== null) {
    for (const item of occupants) {
      if (item.kind === snapTarget.kind && item.id === snapTarget.id) snapOccupantKey = item.key;
    }
  }

  const remove = (item: LocationOccupant): void => {
    if (item.kind === 'weapon') onRemoveMount(item.index);
    else if (item.kind === 'ammo') onRemoveAmmo(item.index);
    else onRemoveEquipment(item.index);
  };

  const plate = armourFacesForDesign(catalog.rules.construction, design, location);
  const target = targeting ?? armed;
  const targetFits = target === null || compatible;
  const invalid = slotsOver || hardpointOver || sizeOver;
  const locationName = MECH_LOCATION_NAMES[location];
  const issueStates = [
    ...(slotsOver ? ['Slots over capacity'] : []),
    ...overHardpointTypes.map(
      (type) => `${type.slice(0, 1).toUpperCase()}${type.slice(1)} hardpoints over capacity`,
    ),
    ...(sizeOver ? ['Weapon too large'] : []),
  ];
  const fitState = target === null
    ? null
    : compatible ? 'Fits held part' : 'Cannot fit held part';
  // Preserve the evaluator's actionable reason instead of reducing refusal to a red state.
  const refusalText = target !== null && !compatible ? refusal : null;

  const classes = ['bay-location', `loc-${location}`];
  if (invalid) classes.push('invalid');
  if (target !== null) classes.push('is-targeting');
  if (target !== null && compatible) classes.push('armed-target');
  if (selected) classes.push('selected');
  if (hovered) classes.push('hovered');
  if (target !== null && compatible) classes.push('compatible');
  if (snapPhase !== 0) classes.push(`snap-phase-${snapPhase}`);

  return (
    <div
      className={classes.join(' ')}
      data-testid={`bay-location-${location}`}
      data-selected={selected || undefined}
      data-compatible={target !== null && compatible || undefined}
      data-invalid={invalid || undefined}
      data-targeting={target === null ? undefined : 'true'}
      data-snap-phase={snapPhase === 0 ? undefined : snapPhase}
      role="group"
      aria-label={`${locationName} location, ${usage.slotsUsed} of ${usage.slotsAvailable} slots used${selected ? ', selected' : ''}${fitState === null ? '' : `, ${fitState.toLowerCase()}`}${refusalText === null ? '' : `, ${refusalText}`}${issueStates.length === 0 ? '' : `, ${issueStates.join(', ').toLowerCase()}`}`}
      aria-invalid={invalid || undefined}
      onPointerEnter={() => onHover?.(location)}
      onPointerLeave={() => onHover?.(null)}
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
        onSelect?.(location);
      }}
    >
      <header>
        <button
          type="button"
          className="bay-location-name"
          aria-pressed={selected}
          aria-label={armed === null ? `Select ${locationName}` : `Fit held part in ${locationName}`}
          disabled={armed !== null && !compatible}
          onClick={(event) => {
            event.stopPropagation();
            onSelect?.(location);
          }}
        >
          {locationName}
        </button>
      </header>

      {target === null ? null : (
        <div className="bay-location-flags">
          {selected ? <span className="location-flag location-flag--selected">Selected</span> : null}
          <span className={`location-flag ${compatible ? 'location-flag--compatible' : 'location-flag--blocked'}`}>
            {fitState}
          </span>
          {issueStates.map((issue) => (
            <span key={issue} className="location-flag location-flag--invalid">{issue}</span>
          ))}
        </div>
      )}

      {refusalText === null ? null : (
        <p className="bay-location-refusal" data-testid={`bay-refusal-${location}`}>
          {refusalText}
        </p>
      )}

      {target === null ? null : (
        <div className="bay-hardpoints">
          {(['energy', 'ballistic', 'missile'] as const).map((type) =>
            hardpoints[type] === 0 ? null : (
              <span
                key={type}
                className={`pip ${type} ${usage.hardpointsUsed[type] > hardpoints[type] ? 'over' : ''}`}
                title={`${type} hardpoints`}
                aria-label={`${type} hardpoints: ${usage.hardpointsUsed[type]} of ${hardpoints[type]} used`}
              >
                {type.slice(0, 1).toUpperCase()} {usage.hardpointsUsed[type]}/{hardpoints[type]}
              </span>
            ),
          )}
          <span
            className={`pip size ${sizeOver ? 'over' : ''}`}
            title={`Takes ${weaponSizeLabel(catalog, usage.size)} weapons and smaller`}
            data-testid={`size-${location}`}
            aria-label={`Maximum weapon size: ${weaponSizeLabel(catalog, usage.size)}`}
          >
            ≤ {weaponSizeLabel(catalog, usage.size)}
          </span>
        </div>
      )}

      <ul
        className="bay-slotgrid"
        data-testid={`slots-grid-${location}`}
        aria-label={`Fitted parts in ${locationName}`}
      >
        {occupants.map((item) => (
          <li
            key={item.key}
            className={`slot-block tone-${item.tone}${item.oversized ? ' too-big' : ''}${item.key === snapOccupantKey ? ' snap-target' : ''}`}
            title={
              item.oversized
                ? `${item.label} — too large for this mount`
                : `${item.label} — ${item.slots} slot${item.slots === 1 ? '' : 's'}`
            }
          >
            <button
              type="button"
              className="slot-block__inspect"
              data-testid={`inspect-${item.kind}-${item.index}`}
              aria-label={`Inspect ${item.label}`}
              onClick={(event) => {
                event.stopPropagation();
                onInspect?.({ kind: item.kind, id: item.id });
              }}
              onFocus={() => onInspect?.({ kind: item.kind, id: item.id })}
            >
              <span>{item.label}</span>
              <RackCells count={item.slots} />
              <small>{item.kind === 'ammo' ? 'Ammo' : item.kind === 'equipment' ? 'Gear' : 'Weapon'} · {item.slots} slot{item.slots === 1 ? '' : 's'}</small>
            </button>
            <button
              type="button"
              className="slot-block__remove"
              data-testid={`remove-${item.kind}-${item.index}`}
              aria-label={`Remove ${item.label} from ${locationName}`}
              title={`Remove ${item.label} from ${locationName}`}
              onClick={(event) => {
                event.stopPropagation();
                mutateAfterStableFocus(stableRemovalFocusTarget(event.currentTarget), () => remove(item));
              }}
            >
              Remove
            </button>
          </li>
        ))}
        <li
          className="slot-block empty"
          data-testid={`free-slots-${location}`}
          aria-label={
            usage.slotsAvailable === 0
              ? 'No fitting space'
              : `${empty} slot${empty === 1 ? '' : 's'} free`
          }
        >
          {usage.slotsAvailable === 0 ? (
            'No fitting space'
          ) : (
            <>
              <RackCells
                count={empty}
                incoming={targetFits && target !== null ? Math.min(empty, armedFootprint(catalog, target)) : 0}
              />
              <small className="rack-free-count">
                {empty} slot{empty === 1 ? '' : 's'} free
              </small>
            </>
          )}
        </li>
      </ul>

      {/* Armour is edited in the workbench; this card mirrors its exact split. */}
      <span
        className="bay-armour-read"
        data-testid={`armour-faces-${location}`}
        tabIndex={0}
        aria-label={`Armour: ${plate.front} front, ${plate.rear} rear, ${design.armour[location]} of ${chassis.armourMax[location]} total`}
        title={
          plate.rear === 0
            ? 'Armour on this location'
            : `${plate.front} on the front, ${plate.rear} on the back — shots from behind meet the rear allocation`
        }
      >
        <strong>Armour</strong>
        <span className="bay-armour-compact">{plate.front}+{plate.rear}</span>
        <span className="bay-armour-detail">
          {plate.front} front · {plate.rear} rear · {design.armour[location]}/{chassis.armourMax[location]} total
        </span>
      </span>
    </div>
  );
}
