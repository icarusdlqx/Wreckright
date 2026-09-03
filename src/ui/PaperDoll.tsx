import { LOCATIONS, type MechLocation } from '../schema/common';
import type { LocationSnapshot } from './store';

const SHORT_NAMES: Record<MechLocation, string> = {
  head: 'HD',
  centre_torso: 'CT',
  left_torso: 'LT',
  right_torso: 'RT',
  left_arm: 'LA',
  right_arm: 'RA',
  left_leg: 'LL',
  right_leg: 'RL',
};

const GRID_AREA: Record<MechLocation, string> = {
  head: 'hd',
  left_arm: 'la',
  left_torso: 'lt',
  centre_torso: 'ct',
  right_torso: 'rt',
  right_arm: 'ra',
  left_leg: 'll',
  right_leg: 'rl',
};

interface Props {
  locations: Record<MechLocation, LocationSnapshot>;
  onSelectLocation?: (location: MechLocation) => void;
  activeLocation?: MechLocation | null;
  /**
   * Two dolls can share the sidebar (the selected machine and its target);
   * the prefix keeps their test ids and labels apart.
   */
  testIdPrefix?: string;
}

function Cell({
  location,
  state,
  onSelect,
  active,
  prefix,
}: {
  location: MechLocation;
  state: LocationSnapshot;
  onSelect?: (location: MechLocation) => void;
  active: boolean;
  prefix: string;
}) {
  const armour = state.armourMax === 0 ? 0 : state.armour / state.armourMax;
  const internal = state.internalMax === 0 ? 0 : state.internal / state.internalMax;
  // Only the torsos have a back, so only three cells grow a third bar. The bar
  // lives inside the button because the cell is the called-shot control.
  const hasBack = state.hasRearArmourFace;
  const rear = state.rearArmourMax === 0 ? 0 : state.rearArmour / state.rearArmourMax;
  const classes = ['doll-cell'];
  if (state.destroyed) classes.push('destroyed');
  if (active) classes.push('active');

  const rearTitle = hasBack
    ? `, rear ${Math.ceil(state.rearArmour)}/${state.rearArmourMax}`
    : '';

  return (
    <button
      type="button"
      className={classes.join(' ')}
      style={{ gridArea: GRID_AREA[location] }}
      onClick={() => onSelect?.(location)}
      disabled={onSelect === undefined}
      title={`${SHORT_NAMES[location]} — armour ${Math.ceil(state.armour)}/${state.armourMax}${rearTitle}, structure ${Math.ceil(state.internal)}/${state.internalMax}`}
      data-testid={`${prefix}-${location}`}
    >
      <span className="doll-label">{SHORT_NAMES[location]}</span>
      <span className="doll-bar armour">
        <span style={{ width: `${Math.max(0, armour) * 100}%` }} />
      </span>
      {hasBack ? (
        <span className="doll-bar rear" data-testid={`${prefix}-rear-${location}`}>
          <span style={{ width: `${Math.max(0, rear) * 100}%` }} />
        </span>
      ) : null}
      <span className="doll-bar internal">
        <span style={{ width: `${Math.max(0, internal) * 100}%` }} />
      </span>
    </button>
  );
}

export function PaperDoll({
  locations,
  onSelectLocation,
  activeLocation,
  testIdPrefix = 'doll',
}: Props) {
  return (
    <div className="paper-doll" data-testid={`paper-${testIdPrefix}`}>
      {LOCATIONS.map((location) => (
        <Cell
          key={location}
          location={location}
          state={locations[location]}
          {...(onSelectLocation === undefined ? {} : { onSelect: onSelectLocation })}
          active={activeLocation === location}
          prefix={testIdPrefix}
        />
      ))}
    </div>
  );
}
