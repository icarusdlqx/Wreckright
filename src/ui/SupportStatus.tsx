import type { World } from '../sim/types';
import { supportStatus, supportStatusProgress, supportStatusTitle } from './supportStatusModel';
import './supportStatus.css';

export function SupportStatus({ world, paused }: { world: World | null; paused: boolean }) {
  const entries = supportStatus(world);
  const first = entries[0];
  if (first === undefined) return null;
  return <aside className="support-status" aria-label="Support status" data-testid="support-status">
    <details>
      <summary title={`${supportStatusTitle(first)} · ${supportStatusProgress(first, paused)}`}>
        <span className="support-status-mark" aria-hidden="true">{first.kind === 'repair' ? 'FIX' : 'SUPPORT'}</span>
        <span className="support-status-summary"><strong>{supportStatusTitle(first)}</strong>
          <span className={paused && first.kind === 'queued' ? 'support-status-paused' : ''}>{supportStatusProgress(first, paused)}</span>
        </span>
        <span className="support-status-expand" aria-label={entries.length > 1 ? `${entries.length} support calls; details` : 'Support details'}>
          {entries.length > 1 ? `+${entries.length - 1} ` : ''}⌄
        </span>
      </summary>
      <ul>{entries.map((entry) => <li key={entry.id} data-testid={`support-status-${entry.kind}`}>
        <strong>{supportStatusTitle(entry)}</strong><span>{supportStatusProgress(entry, paused)}</span>
        <p>{entry.detail}</p>
      </li>)}</ul>
    </details>
  </aside>;
}
