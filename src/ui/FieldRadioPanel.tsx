import { useEffect, useSyncExternalStore } from 'react';
import { dismissRadio, readRadioMessage, subscribeRadio } from './fieldRadio';
import { PilotPortrait } from './PilotPortrait';
import './fieldCommand.css';
import { FIELD_RADIO } from '../schema/fieldRadio';

export function FieldRadioPanel() {
  const message = useSyncExternalStore(subscribeRadio, readRadioMessage, () => null);
  useEffect(() => {
    if (message === null) return;
    const seconds = FIELD_RADIO.displaySeconds[message.priority === 'story' ? 'story' : 'routine'];
    const timer = setTimeout(() => dismissRadio(message.id), seconds * 1000);
    return () => clearTimeout(timer);
  }, [message]);
  if (message === null) return null;
  return <aside className={`field-radio field-radio--${message.priority}`} data-testid="field-radio" aria-live="polite">
    {message.pilot === null ? <span className="field-radio__mark" aria-hidden="true">⌁</span> : <PilotPortrait pilot={message.pilot} compact />}
    <div><span className="field-radio__channel">{message.priority === 'urgent' ? 'Priority report' : 'Company radio'}</span><strong>{message.speaker}</strong><p>{message.text}</p></div>
    <button type="button" onClick={() => dismissRadio(message.id)} aria-label="Dismiss radio report">×</button>
  </aside>;
}
