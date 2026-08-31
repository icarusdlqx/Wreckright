import { rngFromState, type Rng } from '../sim/rng';
import type { CampaignState } from './types';

export const CAMPAIGN_LOG_LIMIT = 200;

/** One bounded path for messages emitted by campaign systems. */
export function logCampaign(state: CampaignState, text: string): void {
  state.log.unshift({ day: state.day, text });
  if (state.log.length > CAMPAIGN_LOG_LIMIT) state.log.length = CAMPAIGN_LOG_LIMIT;
}

/** Commits exactly the draws made from the campaign's persisted random stream. */
export function withCampaignRng<T>(state: CampaignState, use: (rng: Rng) => T): T {
  const rng = rngFromState(state.rng);
  const value = use(rng);
  state.rng = rng.save();
  return value;
}
