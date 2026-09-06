import { useId, useRef, useState } from 'react';
import type { SupportOption } from './supportOptions';

const CALL_MARKS: Record<SupportOption['id'], string> = {
  sensor_probe: 'SCAN',
  air_strike: 'AIR',
  repair_truck: 'FIX',
  reinforcement: 'DROP',
  artillery_strike: 'GUN',
  minelayer: 'MINE',
};

interface SupportPaletteProps {
  options: readonly SupportOption[];
  resourcePoints: number;
  active: SupportOption['id'] | null;
  notice?: string | null;
  reservesLeft: number;
  paused?: boolean;
  onPick: (call: SupportOption['id']) => void;
  embedded?: boolean;
}

export function supportAvailability(
  option: SupportOption,
  resourcePoints: number,
  reservesLeft: number,
  active: SupportOption['id'] | null,
): { disabled: boolean; status: string } {
  if (active === option.id) {
    return { disabled: false, status: `Armed · ${option.placement} Choose this call again to cancel.` };
  }
  if (option.id === 'reinforcement' && reservesLeft === 0) {
    return { disabled: true, status: 'No mission reserve remains.' };
  }
  if (resourcePoints < option.cost) {
    return { disabled: true, status: `${option.cost - resourcePoints} RP short.` };
  }
  return {
    disabled: false,
    status: option.placement,
  };
}

/** A single battlefield entry point with the choices disclosed on demand. */
export function SupportPalette({
  options,
  resourcePoints,
  active,
  notice = null,
  reservesLeft,
  paused = false,
  onPick,
  embedded = false,
}: SupportPaletteProps) {
  const drawerId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [focusedId, setFocusedId] = useState<SupportOption['id'] | null>(active);
  const drawerOpen = embedded || open;
  const focused =
    options.find((option) => option.id === (focusedId ?? active)) ?? options[0] ?? null;
  const armed = options.find((option) => option.id === active) ?? null;

  const pick = (option: SupportOption): void => {
    const state = supportAvailability(option, resourcePoints, reservesLeft, active);
    setFocusedId(option.id);
    if (state.disabled) return;
    onPick(option.id);
    if (!embedded) {
      setOpen(false);
      toggleRef.current?.focus();
    }
  };

  return (
    <div
      className={`support${drawerOpen ? ' open' : ''}${embedded ? ' embedded' : ''}`}
      data-testid="support-palette"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        if (!embedded && drawerOpen) {
          event.stopPropagation();
          setOpen(false);
          toggleRef.current?.focus();
        } else if (active !== null) {
          event.stopPropagation();
          onPick(active);
        }
      }}
    >
      {embedded ? null : (
        <button
          type="button"
          ref={toggleRef}
          className={`support-toggle${active === null ? '' : ' active'}`}
          aria-expanded={drawerOpen}
          aria-controls={drawerId}
          onClick={() => setOpen((current) => !current)}
          data-testid="support-toggle"
        >
          <span>{armed === null ? 'Support' : armed.label}</span>
          <span className="support-toggle-rp" data-testid="resource-points">
            {resourcePoints} RP
          </span>
        </button>
      )}

      <section
        id={drawerId}
        className="support-drawer"
        aria-label="Support calls"
        hidden={!drawerOpen}
      >
        {embedded ? (
          <span className="rp" data-testid="resource-points">
            {resourcePoints} RP
          </span>
        ) : null}
        <div className="support-choices">
          {options.map((option) => {
            const { disabled, status } = supportAvailability(
              option,
              resourcePoints,
              reservesLeft,
              active,
            );
            return (
              <button
                key={option.id}
                type="button"
                className={`support-call${active === option.id ? ' active' : ''}`}
                aria-disabled={disabled}
                aria-pressed={active === option.id}
                title={status}
                onFocus={() => setFocusedId(option.id)}
                onMouseEnter={() => setFocusedId(option.id)}
                onClick={() => pick(option)}
                data-testid={`support-${option.id}`}
              >
                <span className="support-mark" aria-hidden="true">
                  {CALL_MARKS[option.id]}
                </span>
                <span className="support-label">{option.label}</span>
                <span className="support-cost">{option.cost} RP</span>
                <span className={`support-availability${disabled ? ' blocked' : ''}`}>
                  {disabled ? status : active === option.id ? 'Choose a target' : option.delaySeconds === 0 ? 'Immediate' : `${option.delaySeconds}s to arrival`}
                </span>
              </button>
            );
          })}
        </div>
        {focused === null ? null : (
          <div className="support-detail" aria-live="polite">
            <strong>{focused.label}</strong>
            <span>{focused.effect}</span>
            <span className={supportAvailability(focused, resourcePoints, reservesLeft, active).disabled ? 'blocked' : ''}>
              {supportAvailability(focused, resourcePoints, reservesLeft, active).status}
            </span>
            <span className="support-dispatch-note">
              {paused && focused.delaySeconds > 0 ? 'Place the call now; resume time to dispatch it.' : focused.delaySeconds === 0 ? 'Activates when placed, including while paused.' : 'Arrival time follows the mission clock.'}
              {' '}RP is spent only after a valid target is placed.
            </span>
          </div>
        )}
      </section>
      {armed === null || drawerOpen ? null : <div className="support-targeting" role="status" data-testid="support-targeting">
        <strong>{armed.label}: choose a target</strong>
        <span>{armed.placement}</span>
        <span>{paused && armed.delaySeconds > 0 ? 'Place now, then resume to dispatch.' : 'The cost is charged when placed.'}</span>
        <button type="button" onClick={() => onPick(armed.id)} data-testid="support-cancel">Cancel support</button>
      </div>}
      {notice === null ? null : (
        <p className="support-notice" role="status" aria-live="polite" data-testid="support-notice">
          Support: {notice}.
        </p>
      )}
    </div>
  );
}
