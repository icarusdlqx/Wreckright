import { useId, useState, useSyncExternalStore } from 'react';
import {
  DEFAULT_AUDIO_PREFERENCES,
  readAudioPreferences,
  subscribeAudioPreferences,
  writeAudioPreferences,
  type AudioPreferences,
} from './audioPreference';
import './AudioSettings.css';

interface AudioSettingsProps {
  compact?: boolean;
  /** Unlock only from this opening gesture, never from a stored preference. */
  onPrepare?: () => void;
}

const VOLUMES = [
  { key: 'master', label: 'Master', help: 'All sound' },
  { key: 'effects', label: 'Effects', help: 'Weapons, movement and weather' },
  { key: 'music', label: 'Music', help: 'Campaign and battle score' },
  { key: 'interface', label: 'Interface', help: 'Orders and alerts' },
] as const;

export function useAudioPreferences(): Readonly<AudioPreferences> {
  return useSyncExternalStore(
    subscribeAudioPreferences, readAudioPreferences, () => DEFAULT_AUDIO_PREFERENCES,
  );
}

/** Native popovers provide keyboard dismissal and stay above campaign and battle panels. */
export function AudioSettings({ compact = false, onPrepare }: AudioSettingsProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const preferences = useAudioPreferences();
  return (
    <div
      className={`audio-settings${compact ? ' audio-settings--compact' : ''}`}
      onKeyDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="audio-settings__trigger"
        data-testid="audio-settings"
        popoverTarget={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        aria-label="Audio settings"
        onClick={() => { if (!open) onPrepare?.(); }}
      >
        Audio settings
      </button>
      <div
        id={id}
        popover="auto"
        role="dialog"
        aria-labelledby={`${id}-title`}
        className="audio-settings__panel"
        data-testid="audio-settings-panel"
        onToggle={(event) => setOpen(event.newState === 'open')}
      >
        <header className="audio-settings__heading">
          <h2 id={`${id}-title`}>Sound settings</h2>
          <button type="button" popoverTarget={id} popoverTargetAction="hide" aria-label="Close sound settings">
            Close
          </button>
        </header>
        <label className="audio-settings__mute">
          <input
            type="checkbox"
            data-testid="audio-mute"
            checked={preferences.muted}
            onChange={(event) => writeAudioPreferences({ muted: event.currentTarget.checked })}
          />
          Mute all sound
        </label>
        {VOLUMES.map(({ key, label, help }) => (
          <label key={key} className="audio-settings__volume" htmlFor={`${id}-${key}`}>
            <span>{label}<output>{Math.round(preferences[key] * 100)}%</output></span>
            <small id={`${id}-${key}-help`}>{help}</small>
            <input
              id={`${id}-${key}`}
              type="range"
              min="0"
              max="100"
              step="5"
              value={Math.round(preferences[key] * 100)}
              aria-valuetext={`${Math.round(preferences[key] * 100)} percent`}
              aria-describedby={`${id}-${key}-help`}
              data-testid={`audio-${key}`}
              onChange={(event) => writeAudioPreferences({ [key]: Number(event.currentTarget.value) / 100 })}
            />
          </label>
        ))}
        <label className="audio-settings__range" htmlFor={`${id}-range`}>
          Dynamic range
          <select
            id={`${id}-range`}
            value={preferences.dynamicRange}
            aria-describedby={`${id}-range-help`}
            data-testid="audio-dynamic-range"
            onChange={(event) => writeAudioPreferences({
              dynamicRange: event.currentTarget.value === 'quiet' ? 'quiet' : 'normal',
            })}
          >
            <option value="normal">Normal</option>
            <option value="quiet">Quiet</option>
          </select>
        </label>
        <p id={`${id}-range-help`} className="audio-settings__help">
          Quiet softens loud peaks for lower-volume listening.
        </p>
        <button
          type="button"
          data-testid="audio-reset"
          onClick={() => writeAudioPreferences({
            ...DEFAULT_AUDIO_PREFERENCES, muted: preferences.muted,
          })}
        >
          Reset mix
        </button>
      </div>
    </div>
  );
}
