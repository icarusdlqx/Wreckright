import { useEffect, useState } from 'react';
import type { MissionPreviewData } from './missionPreviewData';
import './missionSurvey.css';

interface Props { data: MissionPreviewData | null; active: boolean; signed: boolean }

export function MissionSurvey({ data, active, signed }: Props) {
  const [image, setImage] = useState<{ data: MissionPreviewData; url: string | null } | null>(null);
  useEffect(() => {
    if (!active || data === null) return;
    let cancelled = false;
    void import('./missionTerrainImage').then(({ missionTerrainImage }) => {
      if (cancelled) return;
      try { setImage({ data, url: missionTerrainImage(data) }); }
      catch { setImage({ data, url: null }); }
    }).catch(() => { if (!cancelled) setImage({ data, url: null }); });
    return () => { cancelled = true; };
  }, [data, active]);
  if (data === null) return null;
  const current = image?.data === data ? image : null;
  return (
    <section className="mission-survey" data-testid="camp-mission-survey" aria-label="Selected mission terrain survey">
      <header><div><p>{signed ? 'Signed contract / terrain survey' : 'Selected operation / terrain survey'}</p><h3>{data.name}</h3></div>
        <span className="survey-tonnage"><strong>{data.tonnage ?? 'Open'}</strong>{data.tonnage === null ? 'tonnage allowance' : 'tonnes maximum'}</span></header>
      <div className="mission-survey-image" data-state={current === null ? 'loading' : current.url === null ? 'unavailable' : 'ready'}>
        {current?.url ? <img src={current.url} alt={`${data.map.name}: the mission’s authored terrain, elevation and ${data.atmosphere.name.toLowerCase()} lighting`} /> : (
          <div className="survey-fallback"><span aria-hidden="true">⌁</span><strong>{data.map.name}</strong><p>{current === null ? 'Preparing terrain survey…' : 'Terrain image unavailable. Mission details remain available.'}</p></div>
        )}
        <span className="survey-orientation">Oblique terrain survey</span>
      </div>
      <footer><div><strong>{data.map.name}</strong><span>{data.map.width * data.map.tileSize} × {data.map.height * data.map.tileSize} m · {data.atmosphere.name}</span></div>
        <p>Terrain only. Contacts and reinforcements must be discovered in the field.</p></footer>
    </section>
  );
}
