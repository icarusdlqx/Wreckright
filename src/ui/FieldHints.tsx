import { useEffect, useState } from 'react';
import { useGame } from './store';
import './fieldCommand.css';

const KEY = 'ironline.field-hints';
function readDismissed(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch { return []; }
}

export function resetFieldHints(): void {
  try { localStorage.removeItem(KEY); } catch { /* The open field can still reset. */ }
  globalThis.window?.dispatchEvent(new Event('wreckright-guidance-reset'));
}

export function FieldHints() {
  const state = useGame();
  const [dismissed, setDismissed] = useState(readDismissed);
  useEffect(() => {
    const reset = (): void => setDismissed([]);
    window.addEventListener('wreckright-guidance-reset', reset);
    return () => window.removeEventListener('wreckright-guidance-reset', reset);
  }, []);
  const hint = state.supportMode !== null
    ? { id: 'support', title: 'Call support with a purpose', text: 'Pick the marked area carefully. A sensor probe reveals tracks; indirect missiles can use live returns. Support spends Resource Points and arrives after its warning.' }
    : state.orderMode === 'called_shot'
      ? { id: 'recovery', title: 'Preserve what you want to recover', text: 'Leg damage can immobilise a valuable hull. Hold fire afterwards and secure the mission. An eliminate-all order still requires stopping every operational enemy.' }
      : state.selection.length > 1 && state.formationPreset !== 'auto'
        ? { id: 'formation', title: 'Choose how the lance arrives', text: 'The formation shapes your destination positions. Give enough room for the heavy machines; Queue preserves each route leg.' }
        : state.contacts.some((contact) => contact.current) && state.enemies.length === 0
          ? { id: 'sensor', title: 'A return is not a visual identification', text: 'Hollow contacts are sensor tracks. Order a scout to investigate; a named contact gives you direct fire and precise targeting.' }
          : null;
  if (hint === null || dismissed.includes(hint.id)) return null;
  return <section className="field-hint" data-testid={`field-hint-${hint.id}`}>
    <strong>{hint.title}</strong><p>{hint.text}</p><button type="button" onClick={() => {
      const next = [...dismissed, hint.id]; setDismissed(next);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Visit-only guidance. */ }
    }}>Got it</button>
  </section>;
}
