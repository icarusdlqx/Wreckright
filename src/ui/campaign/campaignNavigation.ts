import { useEffect, useState } from 'react';

export type CompanyArea = 'operations' | 'workshop' | 'crew' | 'supplies';
export interface CampaignNavigationTarget {
  area: CompanyArea;
  pilotId?: string;
  mechId?: string;
  hiring?: boolean;
}

/** Receipt links select a workspace and record; they never issue a workshop or training order. */
export function useCampaignNavigation(runId: string) {
  const [area, setArea] = useState<CompanyArea>('operations');
  const [target, setTarget] = useState<CampaignNavigationTarget | null>(null);
  useEffect(() => { setArea('operations'); setTarget(null); }, [runId]);
  const navigate = (next: CampaignNavigationTarget): void => {
    setArea(next.area);
    setTarget({ ...next });
    globalThis.requestAnimationFrame?.(() => {
      const testId = next.pilotId ? `crew-select-${next.pilotId}` : next.mechId ? `camp-inspect-${next.mechId}`
        : next.hiring ? 'crew-hiring-tab' : `camp-area-${next.area}`;
      const element = [...(globalThis.document?.querySelectorAll<HTMLElement>('[data-testid]') ?? [])]
        .find((entry) => entry.dataset.testid === testId);
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({ block: 'nearest' });
    });
  };
  return { area, setArea, target, navigate };
}
