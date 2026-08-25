import type { Chassis } from '../../schema/chassis';
import type { MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { armourFacesForDesign } from '../../sim/designArmour';
import { weaponSize, weaponSizeLabel, type LocationUsage } from '../../sim/loadout';

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

/** One thing bolted into this location, and how much room it takes. */
interface Occupant {
  key: string;
  kind: 'weapon' | 'ammo' | 'equipment';
  id: string;
  index: number;
  label: string;
  slots: number;
  /** Colours the block by what it is: energy, ballistic, missile, ammo, gear. */
  tone: string;
  /** True when the mount is too small for what has been put in it. */
  oversized: boolean;
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
  /** Called when the player picks something here, so the dossier can follow. */
  onInspect?: (payload: DropPayload) => void;
  onSelect?: (location: MechLocation) => void;
  onHover?: (location: MechLocation | null) => void;
  selected?: boolean;
  hovered?: boolean;
  compatible?: boolean;
  /**
   * What the player has picked up off the shelf and not yet placed. Dragging
   * does not exist on a touch screen, so the bay also works as pick-then-place:
   * while something is armed, a location is a target rather than a display.
   */
  armed?: DropPayload | null;
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
  armed = null,
}: Props) {
  const hardpoints = chassis.hardpoints[location];
  const slotsOver = usage.slotsUsed > usage.slotsAvailable;

  const overHardpointTypes = (['energy', 'ballistic', 'missile'] as const).filter(
    (type) => usage.hardpointsUsed[type] > usage.hardpointsAvailable[type],
  );
  const hardpointOver = overHardpointTypes.length > 0;

  // Everything fitted here, in the order it was bolted on, with the room it
  // takes. This is the loadout as the machine actually carries it.
  const occupants: Occupant[] = [];
  let sizeOver = false;

  design.mounts.forEach((mount, index) => {
    if (mount.location !== location) return;
    const weapon = catalog.weapons.get(mount.weaponId);
    const oversized = weapon !== undefined && weaponSize(catalog, weapon) > usage.size;
    if (oversized) sizeOver = true;
    occupants.push({
      key: `m${index}`,
      kind: 'weapon',
      id: mount.weaponId,
      index,
      label: weapon?.name ?? mount.weaponId,
      slots: weapon?.slots ?? 1,
      tone: weapon?.type ?? 'energy',
      oversized,
    });
  });

  design.ammo.forEach((load, index) => {
    if (load.location !== location) return;
    const weapon = catalog.weapons.get(load.weaponId);
    occupants.push({
      key: `a${index}`,
      kind: 'ammo',
      id: load.weaponId,
      index,
      label: `${weapon?.name ?? load.weaponId} ammo ×${load.tons}`,
      slots: Math.max(1, Math.round(load.tons * catalog.rules.construction.ammoSlotsPerTon)),
      tone: 'ammo',
      oversized: false,
    });
  });

  design.equipment.forEach((fit, index) => {
    if (fit.location !== location) return;
    const gear = catalog.equipment.get(fit.equipmentId);
    occupants.push({
      key: `e${index}`,
      kind: 'equipment',
      id: fit.equipmentId,
      index,
      label: gear?.name ?? fit.equipmentId,
      slots: gear?.slots ?? 1,
      tone: 'gear',
      oversized: false,
    });
  });

  const filled = occupants.reduce((total, item) => total + item.slots, 0);
  const empty = Math.max(0, usage.slotsAvailable - filled);

  const remove = (item: Occupant): void => {
    if (item.kind === 'weapon') onRemoveMount(item.index);
    else if (item.kind === 'ammo') onRemoveAmmo(item.index);
    else onRemoveEquipment(item.index);
  };

  const plate = armourFacesForDesign(catalog.rules.construction, design, location);
  const armedFits = armed === null || compatible;
  const invalid = slotsOver || hardpointOver || sizeOver;
  const locationName = MECH_LOCATION_NAMES[location];
  const issueStates = [
    ...(slotsOver ? ['Slots over capacity'] : []),
    ...overHardpointTypes.map(
      (type) => `${type.slice(0, 1).toUpperCase()}${type.slice(1)} hardpoints over capacity`,
    ),
    ...(sizeOver ? ['Weapon too large'] : []),
  ];
  const fitState = armed === null
    ? compatible ? 'Fits previewed part' : null
    : compatible ? 'Fits held part' : 'Cannot fit held part';

  const classes = ['bay-location', `loc-${location}`];
  if (invalid) classes.push('invalid');
  if (armed !== null && compatible) classes.push('armed-target');
  if (selected) classes.push('selected');
  if (hovered) classes.push('hovered');
  if (compatible) classes.push('compatible');

  return (
    <div
      className={classes.join(' ')}
      data-testid={`bay-location-${location}`}
      data-selected={selected || undefined}
      data-compatible={compatible || undefined}
      data-invalid={invalid || undefined}
      role="group"
      aria-label={`${locationName} location${selected ? ', selected' : ''}${fitState === null ? '' : `, ${fitState.toLowerCase()}`}${issueStates.length === 0 ? '' : `, ${issueStates.join(', ').toLowerCase()}`}`}
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
      // The other half of pick-then-place. The card surface remains a generous
      // touch target while fitted-part controls keep their own explicit jobs.
      onClick={() => {
        if (armed !== null) {
          if (armedFits) onDrop(armed, location);
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
        <span
          className={`bay-slots ${slotsOver ? 'over' : ''}`}
          data-testid={`slots-${location}`}
          aria-label={`${usage.slotsUsed} of ${usage.slotsAvailable} slots used`}
        >
          {usage.slotsUsed}/{usage.slotsAvailable} slots
        </span>
      </header>

      <div className="bay-location-flags">
        {selected ? <span className="location-flag location-flag--selected">Selected</span> : null}
        {fitState === null ? null : (
          <span className={`location-flag ${compatible ? 'location-flag--compatible' : 'location-flag--blocked'}`}>
            {fitState}
          </span>
        )}
        {issueStates.map((issue) => (
          <span key={issue} className="location-flag location-flag--invalid">{issue}</span>
        ))}
      </div>

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

      <ul
        className="bay-slotgrid"
        data-testid={`slots-grid-${location}`}
        aria-label={`Fitted parts in ${locationName}`}
      >
        {occupants.map((item) => (
          <li
            key={item.key}
            className={`slot-block tone-${item.tone}${item.oversized ? ' too-big' : ''}`}
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
        <li className="slot-block empty" data-testid={`free-slots-${location}`}>
          {usage.slotsAvailable === 0
            ? 'No fitting space'
            : `${empty} slot${empty === 1 ? '' : 's'} free`}
        </li>
      </ul>

      {/* Armour is edited in the workbench; this card mirrors its exact split. */}
      <span
        className="bay-armour-read"
        data-testid={`armour-faces-${location}`}
        aria-label={`Armour: ${plate.front} front, ${plate.rear} rear, ${design.armour[location]} of ${chassis.armourMax[location]} total`}
        title={
          plate.rear === 0
            ? 'Armour on this location'
            : `${plate.front} on the front, ${plate.rear} on the back — shots from behind meet the rear allocation`
        }
      >
        <strong>Armour</strong>
        <span>{plate.front} front</span>
        <span>{plate.rear} rear</span>
        <span>{design.armour[location]}/{chassis.armourMax[location]} total</span>
      </span>
    </div>
  );
}
