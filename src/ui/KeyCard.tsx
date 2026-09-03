import { useState } from 'react';

interface Binding {
  keys: string;
  action: string;
}

const GROUPS: ReadonlyArray<{ title: string; bindings: readonly Binding[] }> = [
  {
    title: 'Selection',
    bindings: [
      { keys: 'Click · drag', action: 'Select a machine · box-select' },
      { keys: 'E', action: 'Select the whole lance' },
      { keys: 'Tab', action: 'Cycle through the lance' },
      { keys: 'Ctrl+1–9 · 1–9', action: 'Bind a group · recall it' },
      { keys: 'Esc', action: 'Clear selection and orders' },
    ],
  },
  {
    title: 'Orders',
    bindings: [
      { keys: 'Right-click', action: 'Move · attack a hostile' },
      { keys: 'M · R', action: 'Walk · run to a point' },
      { keys: 'A', action: 'Attack-move: advance, fight what appears' },
      { keys: 'F · Q', action: 'Attack a target · target the nearest' },
      { keys: 'C', action: 'Called shot at one section' },
      { keys: 'S · G · H', action: 'Stop · guard here · hold fire' },
      { keys: 'K', action: 'Keep facing the target while moving' },
      { keys: 'Shift+click', action: 'Queue the order after the current one, at its pace' },
      { keys: 'Shift+right-click', action: 'Run there — queued behind a move in progress' },
      { keys: 'J', action: 'Jump to a point' },
    ],
  },
  {
    title: 'Machine',
    bindings: [
      { keys: 'V', action: "Pilot's ability" },
      { keys: 'X', action: 'Alpha strike: every gun, all the heat' },
      { keys: 'T', action: 'Stay Cool on or off' },
    ],
  },
  {
    title: 'View and time',
    bindings: [
      { keys: 'Space', action: 'Pause' },
      { keys: ', · .', action: 'Slower · faster' },
      { keys: 'Arrows · WASD · wheel', action: 'Pan · zoom (A and S pan when held)' },
      { keys: 'L', action: 'Follow the selection until you pan' },
      { keys: '`', action: 'Commander map' },
    ],
  },
];

/** Every binding on one card, because the order bar only shows the first row of them. */
export function KeyCard() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="pause"
        aria-expanded={open}
        aria-controls="key-card"
        onClick={() => setOpen((value) => !value)}
        title="Show every key"
        data-testid="key-card-toggle"
      >
        Keys
      </button>
      {open ? (
        <div className="key-card" id="key-card" role="dialog" aria-label="Keyboard controls" data-testid="key-card">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h4>{group.title}</h4>
              <dl>
                {group.bindings.map((binding) => (
                  <div key={binding.keys}>
                    <dt>{binding.keys}</dt>
                    <dd>{binding.action}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      ) : null}
    </>
  );
}
