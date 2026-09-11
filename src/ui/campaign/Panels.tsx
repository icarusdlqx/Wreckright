import type { CampaignState } from '../../campaign/types';
export { BarracksPanel } from './BarracksPanel';
export { MechBayPanel } from './CompanyWorkshop';
export { StoresPanel } from './StoresPanel';
export { MarketPanel } from './MarketPanel';

export function cbills(value: number): string {
  return `${Math.round(value).toLocaleString('en-GB')} C`;
}

export interface PanelProps {
  state: CampaignState;
  /** Return a refusal from the model so the clicked action cannot overwrite it. */
  mutate: (change: (draft: CampaignState) => string | null | void, message?: string) => void;
}
