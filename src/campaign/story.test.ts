import { describe, expect, it } from 'vitest';
import { getCatalog } from '../schema/load';
import { CampaignStorySchema } from '../schema/campaignStory';
import { campaignStory, earnedCampaignStory } from './story';
import { startCampaign } from './campaign';
import { deserialiseCampaign, serialiseCampaign } from './save';

const catalog = getCatalog();
const campaigns = [...catalog.campaigns.values()];

describe('the two authored faction campaigns', () => {
  it('offers exactly one complete story for each faction, with its own company and ending milestones', () => {
    expect(campaigns.map((campaign) => campaign.presentation?.faction).sort()).toEqual(['aurelian', 'linewrought']);
    const startingDesigns = new Set<string>();
    const storyTitles = new Set<string>();
    for (const campaign of campaigns) {
      const story = campaignStory(campaign)!;
      expect(story, campaign.id).toBeDefined();
      storyTitles.add(story.title);
      expect(story.chapters.length).toBeGreaterThanOrEqual(7);
      for (const id of new Set(campaign.startingDesignIds)) {
        expect(startingDesigns.has(id)).toBe(false);
        startingDesigns.add(id);
        const design = catalog.designs.get(id)!;
        expect(catalog.chassis.get(design.chassisId)?.faction).toBe(campaign.presentation?.faction);
      }
      for (const ending of [campaign.victoryNodeId, ...campaign.alternateVictoryNodeIds]) {
        expect(story.chapters.some((chapter) => chapter.afterNodeId === ending)).toBe(true);
      }
    }
    expect(storyTitles.size).toBe(2);
  });

  it.each(campaigns)('reveals only earned chapters in $id, including optional branches', (campaign) => {
    const story = campaignStory(campaign)!;
    expect(earnedCampaignStory(story, [])).toEqual([story.opening]);
    const first = story.chapters[0]!;
    const later = story.chapters[3]!;
    expect(earnedCampaignStory(story, [later.afterNodeId, first.afterNodeId, 'unrelated_posting']))
      .toEqual([story.opening, first, later]);
    expect(earnedCampaignStory(story, [first.afterNodeId])).not.toContain(later);
  });

  it.each(campaigns)('does not reveal an unchosen ending in $id', (campaign) => {
    const story = campaignStory(campaign)!;
    const alternate = campaign.alternateVictoryNodeIds[0]!;
    const earned = earnedCampaignStory(story, [alternate]);
    expect(earned.at(-1)).toMatchObject({ afterNodeId: alternate });
    expect(earned).not.toContain(story.chapters.find((chapter) => chapter.afterNodeId === campaign.victoryNodeId));
  });

  it('derives progress from a restored legacy company without adding new save fields', () => {
    const state = startCampaign(catalog, 'border_dispute', 'story-save');
    state.completedNodes.push('militia_raid', 'pass_skirmish');
    const restored = deserialiseCampaign(serialiseCampaign(state)).state!;
    const story = campaignStory(catalog.campaigns.get(restored.campaignId)!)!;
    expect(earnedCampaignStory(story, restored.completedNodes).at(-1)?.title).toBe('White armour in the yard');
    expect(restored).not.toHaveProperty('story');
  });

  it('rejects a mistyped or repeated story milestone before it can silently disappear', () => {
    const campaign = campaigns[0]!;
    const story = campaignStory(campaign)!;
    expect(CampaignStorySchema.safeParse({ ...story, chapters: [story.chapters[0], story.chapters[0]] }).success).toBe(false);
    expect(() => campaignStory({ ...campaign, nodes: [] })).toThrow('Unknown story milestone');
  });
});
