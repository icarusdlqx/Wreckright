import { useState } from 'react';
import { applyRefit, refitAvailability } from '../../campaign/refit';
import type { CampaignState } from '../../campaign/types';
import type { Catalog } from '../../schema/load';
import { authoredDesignName } from '../designLabel';
import type { BayCommission } from '../mechbay/Mechbay';
import type { DropPayload } from '../mechbay/dropPayload';
import type { FirstDropPrep } from './firstDropGuide';
import type { PanelProps } from './Panels';

export function useCampaignRefit({ catalog, state, prep, mutate, onStatus }: {
  catalog: Catalog;
  state: CampaignState;
  prep: FirstDropPrep;
  mutate: PanelProps['mutate'];
  onStatus: (message: string) => void;
}) {
  const [request, setRequest] = useState<{ mechId: string; part?: DropPayload } | null>(null);
  const refitting = request?.mechId ?? null;
  const mech = state.mechs.find((entry) => entry.id === refitting);
  const setRefitting = (mechId: string | null): void => setRequest(mechId === null ? null : { mechId });
  const refitBay: BayCommission | null = mech === undefined ? null : {
    title: authoredDesignName(catalog, mech.design),
    cancelLabel: prep === null ? 'Back to company' : 'Back to preparation',
    design: mech.design,
    ...(request?.part === undefined ? {} : { initialPart: request.part }),
    inventory: refitAvailability(state, mech),
    onCancel: () => setRequest(null),
    onCommit: (next) => {
      let outcome = { ok: false, reason: 'That mech is no longer in the bay.' as string | null };
      mutate((draft) => {
        const target = draft.mechs.find((entry) => entry.id === mech.id);
        if (target !== undefined) outcome = applyRefit(catalog, draft, target, next);
      });
      if (outcome.ok) {
        setRequest(null);
        onStatus(`${authoredDesignName(catalog, next)} refitted.`);
      }
      return outcome;
    },
  };
  return { refitting, refitBay, setRefitting,
    onRefitPart: (mechId: string, part: DropPayload) => setRequest({ mechId, part }) };
}
