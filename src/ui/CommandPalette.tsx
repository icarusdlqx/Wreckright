import type { ReactNode } from 'react';
import { actionStatus } from './combatTelemetry';
import type { OrderMode, TimedActionSnapshot } from './store';
import './battleChrome.css';

export interface Command {
  id: string;
  label: string;
  key: string;
  mode: OrderMode;
  disabled?: boolean;
  title?: string;
}

export const COMMANDS: readonly Command[] = [
  { id: 'move', label: 'Move', key: 'M', mode: 'move' },
  { id: 'run', label: 'Run', key: 'R', mode: 'run' },
  {
    id: 'attack_move',
    label: 'Attack Move',
    key: 'A',
    mode: 'attack_move',
    title: 'Advance to a point, stopping to fight whatever shows itself (A)',
  },
  { id: 'attack', label: 'Attack', key: 'F', mode: 'attack' },
  {
    id: 'stop',
    label: 'Stop',
    key: 'S',
    mode: null,
    title: 'Halt where it stands and drop the current orders; weapons stay live (S)',
  },
  { id: 'called_shot', label: 'Called Shot', key: 'C', mode: 'called_shot' },
  { id: 'hold_fire', label: 'Hold Fire', key: 'H', mode: null },
  {
    id: 'hold_position',
    label: 'Guard',
    key: 'G',
    mode: null,
    title: 'Hold this ground and engage at will. Press again to release (G)',
  },
  {
    id: 'ability',
    label: 'Ability',
    key: 'V',
    mode: null,
    title: "Call on the pilot's speciality (V)",
  },
  {
    id: 'alpha_strike',
    label: 'Alpha Strike',
    key: 'X',
    mode: null,
    title: 'Fire everything at once and accept the heat. This is how mechs shut down (X)',
  },
  {
    id: 'heat_safety',
    label: 'Stay Cool',
    key: 'T',
    mode: null,
    title: 'Shed the hottest guns rather than risk a shutdown. Off means weapons free (T)',
  },
  {
    id: 'jump',
    label: 'Jump',
    key: 'J',
    mode: 'jump',
    title: 'Fire the jets at a point inside their reach — heat now, cooldown after (J)',
  },
];

interface Props {
  orderMode: OrderMode;
  enabled: boolean;
  holdingFire: boolean;
  heatSafety: boolean;
  ability: TimedActionSnapshot | null;
  alpha: TimedActionSnapshot | null;
  /** Jets aboard, charged and free to fire. Null when nothing is selected. */
  jump: { ready: boolean; range: number; cooldown: number } | null;
  /** The standing order the selected mech is following. */
  posture: string;
  leading?: ReactNode;
  visibleCommandIds?: ReadonlySet<string> | null;
  onCommand: (command: Command) => void;
}

interface CommandButtonProps {
  command: Command;
  orderMode: OrderMode;
  enabled: boolean;
  holdingFire: boolean;
  heatSafety: boolean;
  ability: TimedActionSnapshot | null;
  alpha: TimedActionSnapshot | null;
  jump: Props['jump'];
  posture: string;
  onCommand: (command: Command) => void;
}

const PRIMARY_COMMANDS = new Set(['move', 'attack_move', 'attack', 'hold_position', 'ability', 'jump']);
const ADVANCED_COMMANDS = new Set([
  'run',
  'called_shot',
  'hold_fire',
  'alpha_strike',
  'heat_safety',
]);

function jumpTitle(jump: Props['jump']): string {
  if (jump === null || jump.range <= 0) return 'This mech has no jump jets';
  if (jump.cooldown > 0) return `Jets recharging — ${jump.cooldown.toFixed(1)}s`;
  if (!jump.ready) return 'The jets cannot fire right now';
  return `Fire the jets up to ${Math.round(jump.range)}m — heat now, cooldown after (J)`;
}

function timedAction(
  command: Command,
  ability: TimedActionSnapshot | null,
  alpha: TimedActionSnapshot | null,
): TimedActionSnapshot | null {
  if (command.id === 'ability') return ability;
  if (command.id === 'alpha_strike') return alpha;
  return null;
}

function commandActive(props: CommandButtonProps): boolean {
  const timed = timedAction(props.command, props.ability, props.alpha);
  return (
    (props.command.mode !== null && props.command.mode === props.orderMode) ||
    (props.command.id === 'hold_fire' && props.holdingFire) ||
    (props.command.id === 'heat_safety' && props.heatSafety) ||
    (timed?.activeRemaining ?? 0) > 0 ||
    props.command.id === props.posture
  );
}

function CommandButton(props: CommandButtonProps) {
  const { command } = props;
  const timed = timedAction(command, props.ability, props.alpha);
  const active = commandActive(props);
  const isJump = command.id === 'jump';
  const disabled = command.disabled === true || !props.enabled || (isJump && props.jump?.ready !== true);
  const title = isJump
    ? jumpTitle(props.jump)
    : timed === null
      ? (command.title ?? `${command.label} (${command.key})`)
      : `${timed.label}: ${timed.note} ${actionStatus(timed)} (${command.key})`;

  return (
    <button
      type="button"
      className={`command ${active ? 'active' : ''} ${timed === null ? '' : 'timed'}`}
      disabled={disabled}
      aria-pressed={active}
      title={title}
      onClick={() => props.onCommand(command)}
      data-testid={`command-${command.id}`}
    >
      <span className="command-key">{command.key}</span>
      <span className="command-label">{timed?.label ?? command.label}</span>
      {timed === null ? null : <span className="command-state">{actionStatus(timed)}</span>}
    </button>
  );
}

export function CommandPalette({
  orderMode,
  enabled,
  holdingFire,
  heatSafety,
  ability,
  alpha,
  jump,
  posture,
  leading,
  visibleCommandIds = null,
  onCommand,
}: Props) {
  const available =
    visibleCommandIds === null
      ? COMMANDS
      : COMMANDS.filter((command) => visibleCommandIds.has(command.id));
  const commands = available.filter((command) => {
    if (command.id === 'ability') return ability !== null;
    if (command.id === 'alpha_strike') return alpha !== null;
    if (command.id === 'jump') return jump !== null && jump.range > 0;
    return true;
  });
  const buttonProps = {
    orderMode,
    enabled,
    holdingFire,
    heatSafety,
    ability,
    alpha,
    jump,
    posture,
    onCommand,
  };

  // Training introduces one idea at a time. Its authored set stays flat so the
  // lesson control never disappears behind a disclosure the player has not met.
  if (visibleCommandIds !== null) {
    return (
      <div className="palette" data-testid="command-palette">
        {commands.map((command) => (
          <CommandButton key={command.id} command={command} {...buttonProps} />
        ))}
      </div>
    );
  }

  const primary = commands.filter((command) => PRIMARY_COMMANDS.has(command.id));
  const advanced = commands.filter((command) => ADVANCED_COMMANDS.has(command.id));
  const advancedActive = advanced.some((command) =>
    commandActive({ command, ...buttonProps }),
  );

  return (
    <div className="palette" data-testid="command-palette">
      {primary.map((command) => (
        <CommandButton key={command.id} command={command} {...buttonProps} />
      ))}
      {leading === undefined && advanced.length === 0 ? null : (
        <details
          className="tactics-menu"
          data-active={advancedActive || undefined}
          onKeyDownCapture={(event) => {
            if (event.key !== 'Escape' || !event.currentTarget.open) return;
            event.currentTarget.open = false;
            (event.currentTarget.firstElementChild as HTMLElement | null)?.focus();
            event.stopPropagation();
          }}
        >
          <summary
            className={`command tactics-toggle${advancedActive ? ' active' : ''}`}
            aria-label="Open tactics and formation controls"
            data-testid="tactics-toggle"
          >
            <span className="command-label">Tactics</span>
          </summary>
          <div className="tactics-drawer" data-testid="tactics-drawer">
            {leading === undefined ? null : <div className="tactics-formation">{leading}</div>}
            {advanced.map((command) => (
              <CommandButton key={command.id} command={command} {...buttonProps} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
