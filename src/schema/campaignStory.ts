import { z } from 'zod';
import { IdSchema } from './common';

const ChapterSchema = z.strictObject({
  title: z.string().min(1).max(80),
  body: z.array(z.string().min(1).max(650)).min(1).max(3),
});

export const CampaignStorySchema = z.strictObject({
  campaignId: IdSchema,
  title: z.string().min(1).max(80),
  summary: z.string().min(1).max(260),
  opening: ChapterSchema,
  chapters: z.array(ChapterSchema.extend({ afterNodeId: IdSchema })).min(1).max(20),
}).superRefine((story, context) => {
  const milestones = story.chapters.map((chapter) => chapter.afterNodeId);
  if (new Set(milestones).size !== milestones.length) {
    context.addIssue({ code: 'custom', path: ['chapters'], message: 'story milestones must be unique' });
  }
});

export type CampaignStory = z.infer<typeof CampaignStorySchema>;
