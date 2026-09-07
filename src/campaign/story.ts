import type { Campaign } from '../schema/campaign';
import { CampaignStorySchema, type CampaignStory } from '../schema/campaignStory';

const stories = new Map(Object.entries(import.meta.glob('../data/campaignStories/*.json', { eager: true, import: 'default' }))
  .map(([path, raw]) => {
    const story = CampaignStorySchema.parse(raw);
    if (!path.endsWith(`/${story.campaignId}.json`)) throw new Error(`Campaign story filename must match its campaign: ${path}`);
    return [story.campaignId, story] as const;
  }));

export function campaignStory(campaign: Campaign): CampaignStory | undefined {
  const story = stories.get(campaign.id);
  if (story?.chapters.some((chapter) => !campaign.nodes.some((node) => node.id === chapter.afterNodeId))) {
    throw new Error(`Unknown story milestone in ${campaign.id}`);
  }
  return story;
}

/** Completed contracts are the source of truth, so old saves earn the same story without migration. */
export function earnedCampaignStory(story: CampaignStory, completedNodes: readonly string[]) {
  return [story.opening, ...story.chapters.filter((chapter) => completedNodes.includes(chapter.afterNodeId))];
}
