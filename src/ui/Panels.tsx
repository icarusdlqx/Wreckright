import type { HitPreviewView, UnitSnapshot, WeaponSnapshot } from './store';
export { SupportPalette } from './SupportPalette';
export { HostileBar } from './ContactsBar';

export function HeatBar({
  heat,
  capacity,
  thresholds,
}: {
  heat: number;
  capacity: number;
  thresholds: readonly number[];
}) {
  const fraction = capacity === 0 ? 0 : Math.min(1.2, heat / capacity);
  const tone = fraction >= 1 ? 'critical' : fraction >= 0.85 ? 'danger' : fraction >= 0.5 ? 'warn' : 'ok';

  return (
    <div className="heat" data-testid="heat-bar">
      <div className="heat-track">
        <div className={`heat-fill ${tone}`} style={{ width: `${Math.min(100, fraction * 100)}%` }} />
        {thresholds
          .filter((threshold) => threshold > 0)
          .map((threshold) => (
            <span key={threshold} className="heat-mark" style={{ left: `${threshold * 100}%` }} />
          ))}
      </div>
      <span className="heat-value">
        {Math.round(heat)}/{Math.round(capacity)}
      </span>
    </div>
  );
}

function CooldownRing({ weapon }: { weapon: WeaponSnapshot }) {
  const ready = weapon.cooldownMax === 0 ? 1 : 1 - weapon.cooldown / weapon.cooldownMax;
  const degrees = Math.round(Math.max(0, Math.min(1, ready)) * 360);
  return (
    <span
      className="cooldown-ring"
      style={{
        background: `conic-gradient(var(--accent) ${degrees}deg, rgba(255,255,255,0.09) ${degrees}deg)`,
      }}
    />
  );
}

function WeaponModeControl({
  weapon,
  onSetMode,
}: {
  weapon: WeaponSnapshot;
  onSetMode?: (mountIndex: number, modeId: string) => void;
}) {
  const { modeName, nextModeId, nextModeName } = weapon;
  if (modeName === null || nextModeId === null || nextModeName === null) return null;
  if (onSetMode === undefined) {
    return (
      <span
        className="weapon-mode-readout"
        data-testid={`weapon-mode-${weapon.index}`}
        title={`${weapon.name} mode`}
      >
        {modeName}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="weapon-mode"
      data-testid={`weapon-mode-${weapon.index}`}
      aria-label={`${weapon.name} mode ${modeName}. Switch to ${nextModeName}`}
      title={`Switch to ${nextModeName}`}
      disabled={weapon.destroyed}
      onClick={() => onSetMode(weapon.index, nextModeId)}
    >
      {modeName}
    </button>
  );
}

/** What a gun that cannot fire says instead of a number. */
const BLOCK_LABELS: Record<string, string> = {
  destroyed: '',
  ammo: 'dry',
  range: 'too far',
  sight: 'no sight',
  arc: 'off arc',
};

export function WeaponGroups({
  unit,
  playerTeam,
  onToggleGroup,
  onSetWeaponMode,
  preview,
}: {
  unit: UnitSnapshot;
  playerTeam?: number;
  onToggleGroup: (group: number) => void;
  onSetWeaponMode?: (mountIndex: number, modeId: string) => void;
  preview?: HitPreviewView;
}) {
  const groups = [1, 2, 3, 4];
  const canSetModes = unit.team === playerTeam && unit.alive ? onSetWeaponMode : undefined;
  const previewByIndex = new Map(
    (preview?.weapons ?? []).map((entry) => [entry.index, entry]),
  );

  return (
    <div className="weapons" data-testid="weapon-groups">
      {groups.map((group) => {
        const mounted = unit.weapons.filter((weapon) => weapon.group === group);
        if (mounted.length === 0) return null;
        const enabled = unit.groupEnabled[group - 1] === true;

        return (
          <div key={group} className={`weapon-group ${enabled ? '' : 'disabled'}`}>
            <button
              type="button"
              className="group-key"
              onClick={() => onToggleGroup(group)}
              aria-pressed={enabled}
              title={`Toggle weapon group ${group}`}
              data-testid={`group-${group}`}
            >
              {group}
            </button>
            <ul>
              {mounted.map((weapon) => {
                const lost = unit.lostLocations.includes(weapon.location);
                const reach =
                  unit.targetRange === null
                    ? null
                    : unit.targetRange <= weapon.shortRange
                      ? 'short'
                      : unit.targetRange <= weapon.longRange
                        ? 'long'
                        : 'over';
                return (
                  <li
                    key={weapon.index}
                    className={weapon.destroyed ? 'destroyed' : reach === 'over' ? 'out-of-range' : ''}
                    title={
                      lost
                        ? `Lost with the ${weapon.location.replace(/_/g, ' ')}`
                        : `Short ${Math.round(weapon.shortRange)}m · reaches ${Math.round(weapon.longRange)}m`
                    }
                  >
                    <CooldownRing weapon={weapon} />
                    <span className="weapon-name">{weapon.name}</span>
                    <WeaponModeControl
                      weapon={weapon}
                      {...(canSetModes === undefined ? {} : { onSetMode: canSetModes })}
                    />
                    <span className={`weapon-range ${reach ?? ''}`}>
                      {Math.round(weapon.longRange)}m
                    </span>
                    <span className="weapon-ammo">
                      {weapon.destroyed
                        ? lost
                          ? 'blown off'
                          : 'wrecked'
                        : weapon.rounds === null
                          ? '—'
                          : weapon.rounds}
                    </span>
                    {(() => {
                      if (preview === undefined) return null;
                      const priced = previewByIndex.get(weapon.index);
                      if (priced === undefined || weapon.destroyed) return null;
                      if (priced.chance !== null) {
                        const percent = Math.round(priced.chance * 100);
                        const grade = percent >= 60 ? 'good' : percent >= 30 ? 'fair' : 'poor';
                        return (
                          <span className={`weapon-hit ${grade}`} data-testid={`tohit-${weapon.index}`}>
                            {percent}%
                          </span>
                        );
                      }
                      const label = BLOCK_LABELS[priced.blocked ?? ''] ?? '';
                      return label === '' ? null : (
                        <span className="weapon-hit blocked">{label}</span>
                      );
                    })()}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function LanceBar({
  units,
  selection,
  onSelect,
}: {
  units: readonly UnitSnapshot[];
  selection: readonly number[];
  onSelect: (id: number) => void;
}) {
  return (
    <div className="lance" data-testid="lance-bar">
      {units.map((unit) => {
        const total = Object.values(unit.locations).reduce(
          (sum, location) => sum + location.armour + location.rearArmour + location.internal,
          0,
        );
        const max = Object.values(unit.locations).reduce(
          (sum, location) =>
            sum + location.armourMax + location.rearArmourMax + location.internalMax,
          0,
        );
        const health = max === 0 ? 0 : total / max;

        return (
          <button
            key={unit.id}
            type="button"
            className={`lance-card ${selection.includes(unit.id) ? 'selected' : ''} ${unit.alive ? '' : 'dead'}`}
            onClick={() => onSelect(unit.id)}
            aria-pressed={selection.includes(unit.id)}
            data-testid={`lance-card-${unit.id}`}
          >
            <span className="lance-name">{unit.pilotName}</span>
            <span className="lance-chassis">{unit.name}</span>
            <span className="lance-health">
              <span style={{ width: `${health * 100}%` }} />
            </span>
            <span className="lance-status">
              {unit.alive
                ? unit.downRemaining > 0
                  ? 'DOWN'
                  : unit.shutdownRemaining > 0
                    ? 'SHUTDOWN'
                    : unit.staggered
                      ? 'STAGGERED'
                      : unit.holdingFire
                        ? 'HOLDING'
                        : unit.motion.toUpperCase()
                : (unit.killMethod ?? 'LOST').toUpperCase()}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function EventLog({ lines }: { lines: readonly string[] }) {
  return (
    <ul className="log" data-testid="event-log">
      {lines.slice(0, 8).map((line, index) => (
        <li key={`${index}-${line}`}>{line}</li>
      ))}
    </ul>
  );
}
