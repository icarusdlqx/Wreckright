import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { startCampaign } from './campaign';
import { campaignEpilogue } from './epilogue';
import { deserialiseCampaign, serialiseCampaign } from './save';

describe('campaign endings', () => {
  it.each(['border_dispute', 'aurelian_recall'])('retains distinct authored endings for %s with surviving company records', (id) => {
    const campaign = catalog.campaigns.get(id)!;
    const titles: string[] = [];
    for (const nodeId of [campaign.victoryNodeId, ...campaign.alternateVictoryNodeIds]) {
      const state = startCampaign(catalog, id, 'ending');
      const node = campaign.nodes.find((entry) => entry.id === nodeId)!;
      expect(node.ending).toBeDefined();
      state.completedNodes.push(nodeId);
      expect(campaignEpilogue(catalog, state)).toBeNull();
      state.finished = true;
      expect(campaignEpilogue(catalog, state)).toBeNull();
      state.won = true;
      state.pilots[0]!.recoveryMissions = 1;
      state.pilots[1]!.dead = true;
      const ending = campaignEpilogue(catalog, state)!;
      expect(ending.title).toBe(node.ending!.title);
      expect(ending.body).toEqual(node.ending!.body);
      expect(ending.survivors).toContainEqual(state.pilots[0]);
      expect(ending.survivors).not.toContainEqual(state.pilots[1]);
      expect(ending.fallen).toEqual([state.pilots[1]]);
      titles.push(ending.title);
      const restored = deserialiseCampaign(serialiseCampaign(state), catalog).state!;
      expect(campaignEpilogue(catalog, restored)?.title).toBe(ending.title);
    }
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('does not turn an old completion flag or lost last battle into a new ending', () => {
    const state = startCampaign(catalog, 'border_dispute', 'premature-ending');
    state.finished = true;
    state.won = true;
    state.completedNodes = ['militia_raid'];
    expect(campaignEpilogue(catalog, state)).toBeNull();
    state.won = false;
    state.completedNodes.push(catalog.campaigns.get(state.campaignId)!.victoryNodeId);
    expect(campaignEpilogue(catalog, state)).toBeNull();
  });
});
