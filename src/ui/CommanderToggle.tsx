import {
  setCommanderView,
  toggleCommanderView,
  useCommanderView,
} from './commanderViewState';

interface CommanderToggleProps {
  compact?: boolean;
  disabled?: boolean;
}

export function CommanderToggle({ compact = false, disabled = false }: CommanderToggleProps) {
  const active = useCommanderView();

  return (
    <button
      type="button"
      className={`commander-toggle${active ? ' active' : ''}`}
      aria-pressed={active}
      disabled={disabled}
      title="Toggle Commander view (`)"
      data-battle-shortcut="Backquote"
      onClick={() => toggleCommanderView()}
      data-testid={compact ? 'mobile-commander-toggle' : 'commander-toggle'}
    >
      {active ? 'Field' : compact ? 'Map' : 'Commander'}
      {compact ? null : <span aria-hidden="true"> · `</span>}
    </button>
  );
}

export function leaveCommanderView(): void {
  setCommanderView(false);
}
