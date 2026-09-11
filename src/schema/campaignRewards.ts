import { z } from 'zod';
import { IdSchema } from './common';
import type { Catalog } from './load';

export const CampaignRewardSchema = z.strictObject({
  id: IdSchema,
  label: z.string().min(1).max(100),
  objectiveId: IdSchema.optional(),
  items: z.array(z.strictObject({ kind: z.enum(['weapon', 'equipment']), itemId: IdSchema,
    count: z.number().int().positive().max(20) })).max(12).optional(),
  hulls: z.array(z.strictObject({ designId: IdSchema, integrityFraction: z.number().positive().max(1) })).max(3).optional(),
  effects: z.strictObject({
    freeRepairDays: z.number().int().positive().max(7).optional(),
    supplierDiscountDays: z.number().int().positive().max(30).optional(),
  }).optional(),
  afterword: z.string().min(1).max(500).optional(),
}).superRefine((reward, ctx) => {
  if ((reward.items?.length ?? 0) + (reward.hulls?.length ?? 0) === 0
    && reward.effects?.freeRepairDays === undefined && reward.effects?.supplierDiscountDays === undefined) {
    ctx.addIssue({ code: 'custom', message: 'a reward must provide items, a hull or a company benefit' });
  }
});

export const CampaignEndingSchema = z.strictObject({
  title: z.string().min(1).max(120),
  body: z.array(z.string().min(1).max(700)).min(1).max(4),
});
export type CampaignReward = z.infer<typeof CampaignRewardSchema>;

export function checkCampaignRewards(catalog: Catalog, push: (file: string, path: string, message: string) => void): void {
  for (const campaign of catalog.campaigns.values()) {
    const file = `campaigns/${campaign.id}.json`;
    campaign.nodes.forEach((node, nodeIndex) => {
      const mission = catalog.missions.get(node.missionId);
      const seen = new Set<string>();
      for (const [index, reward] of (node.rewards ?? []).entries()) {
        const path = `nodes.${nodeIndex}.rewards.${index}`;
        if (seen.has(reward.id)) push(file, `${path}.id`, 'reward ids must be unique within a node');
        seen.add(reward.id);
        if (reward.objectiveId !== undefined && !mission?.objectives.some((objective) => objective.id === reward.objectiveId && objective.team === 0)) {
          push(file, `${path}.objectiveId`, 'reward requires a player objective in this mission');
        }
        for (const [itemIndex, item] of (reward.items ?? []).entries()) {
          const source = item.kind === 'weapon' ? catalog.weapons : catalog.equipment;
          if (!source.has(item.itemId)) push(file, `${path}.items.${itemIndex}.itemId`, `unknown ${item.kind} "${item.itemId}"`);
        }
        for (const [hullIndex, hull] of (reward.hulls ?? []).entries()) {
          const design = catalog.designs.get(hull.designId);
          if (design === undefined || !catalog.chassis.has(design.chassisId)) push(file, `${path}.hulls.${hullIndex}.designId`, `unknown hull "${hull.designId}"`);
        }
      }
      if (node.ending !== undefined && node.id !== campaign.victoryNodeId && !campaign.alternateVictoryNodeIds.includes(node.id)) {
        push(file, `nodes.${nodeIndex}.ending`, 'an epilogue belongs to a campaign victory node');
      }
    });
  }
}
