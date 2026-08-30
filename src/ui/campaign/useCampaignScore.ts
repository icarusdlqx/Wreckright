import type { CampaignState } from '../../campaign/types';
import type { Catalog } from '../../schema/load';
import { useStrategicScore, useStrategicScoreControls } from '../StrategicScoreProvider';
import { campaignCultureShare } from '../audioScoreTreatments';

export function useCampaignScore(catalog: Catalog, state: CampaignState) {
  useStrategicScore('campaign', campaignCultureShare(catalog, state));
  return useStrategicScoreControls();
}
