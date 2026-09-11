import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { startCampaign, acceptContract, campaignNodes } from '../campaign/campaign';
import { campaignBattleBriefing } from './campaignBattleBriefing';

describe('faction contract briefing', () => {
  it.each(['border_dispute', 'aurelian_recall'])('carries the %s story into deployment while leaving tactical objectives intact', (campaignId) => {
    const state = startCampaign(catalog, campaignId, 'briefing-test');
    const node = campaignNodes(catalog, state)[0]!;
    const mission = catalog.missions.get(node.missionId)!;
    const objectives = structuredClone(mission.objectives);
    acceptContract(catalog, state, node.id, 'standard');
    expect(campaignBattleBriefing(catalog, state)).toEqual({ name: node.name, briefing: node.brief });
    expect(mission.objectives).toEqual(objectives);
  });

  it('does not invent a contract briefing for an uncontracted company', () => {
    const state = startCampaign(catalog, 'border_dispute', 'briefing-test');
    expect(campaignBattleBriefing(catalog, state)).toBeUndefined();
  });
});
