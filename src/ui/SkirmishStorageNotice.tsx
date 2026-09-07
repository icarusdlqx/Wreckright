import { useEffect, useRef } from 'react';

export function SkirmishStorageNotice({ rosters, revision }: { rosters: string[]; revision: number }) {
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => { notice.current?.scrollIntoView({ block: 'nearest' }); }, [revision]);
  if (rosters.length === 0) return null;
  return <div ref={notice} role="alert" className="skirmish-storage-notice" data-testid="skirmish-storage-warning">
    <strong>Loadouts kept for this session only</strong>
    <p>Browser storage is unavailable or full. These changes work now but will be lost if you reload or close this page.</p>
    <ul>{rosters.map((roster) => <li key={roster}>{roster}</li>)}</ul>
  </div>;
}
