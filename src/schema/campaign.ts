import { z } from 'zod';
import { CampaignRewardSchema, CampaignEndingSchema } from './campaignRewards';
import { IdSchema, NameSchema } from './common';

export const CampaignNodeSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  missionId: IdSchema,
  employerId: IdSchema,
  brief: z.string().min(1).max(400),
  requires: z.array(IdSchema).max(4).default([]),
  basePayout: z.number().int().positive(),
  maxSalvageShare: z.number().min(0).max(1),
  deadlineDays: z.number().int().positive().max(180),
  rewards: z.array(CampaignRewardSchema).max(8).optional(),
  ending: CampaignEndingSchema.optional(),
  position: z.strictObject({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
});

export const CampaignEmployerSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
});

export const CampaignRouteSchema = z.strictObject({
  revision: z.number().int().positive(),
  victoryNodeId: IdSchema,
  alternateVictoryNodeIds: z.array(IdSchema).max(3).default([]),
  nodes: z.array(z.strictObject({
    id: IdSchema,
    requires: z.array(IdSchema).max(4).default([]),
  })).min(1).max(40),
});

export const CampaignSchema = z
  .strictObject({
    id: IdSchema,
    name: NameSchema,
    contentRevision: z.number().int().positive().default(1),
    legacyRoutes: z.array(CampaignRouteSchema).max(8).default([]),
    presentation: z.strictObject({ faction: z.enum(['linewrought', 'aurelian']), title: z.string().max(80), premise: z.string().max(400), strength: z.string().max(250), tradeoff: z.string().max(250) }).optional(),
    startingCbills: z.number().int().positive(),
    startingDay: z.number().int().nonnegative(),
    startingDesignIds: z.array(IdSchema).min(1).max(12),
    startingPilotIds: z.array(IdSchema).min(1).max(12),
    demoSupplies: z.strictObject({
      id: IdSchema,
      label: z.string().min(1).max(100),
      description: z.string().min(1).max(400),
      items: z.array(z.strictObject({ kind: z.enum(['weapon', 'equipment']), itemId: IdSchema,
        count: z.number().int().positive().max(20) })).min(1).max(20),
    }).optional(),
    hiringPoolPilotIds: z.array(IdSchema).max(12).default([]),
    victoryNodeId: IdSchema,
    alternateVictoryNodeIds: z.array(IdSchema).max(3).default([]),
    employers: z.array(CampaignEmployerSchema).min(1).max(40),
    /**
     * The pool the hiring hall draws side work from: missions that can be
     * offered as filler, and the outfits that post them. Empty means this
     * campaign offers no side work at all.
     */
    sideWork: z
      .strictObject({
        missionIds: z.array(IdSchema).max(20),
        employerIds: z.array(IdSchema).max(20),
      })
      .prefault({ missionIds: [], employerIds: [] }),
    nodes: z.array(CampaignNodeSchema).min(1).max(40),
  })
  .superRefine((campaign, ctx) => {
    const ids = new Set(campaign.nodes.map((node) => node.id));
    const employerIds = new Set(campaign.employers.map((employer) => employer.id));
    const employerNames = new Set(
      campaign.employers.map((employer) =>
        employer.name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-GB'),
      ),
    );
    const legacyRevisions = new Set(campaign.legacyRoutes.map((route) => route.revision));

    if (ids.size !== campaign.nodes.length) {
      ctx.addIssue({ code: 'custom', path: ['nodes'], message: 'node ids must be unique' });
    }

    if (employerIds.size !== campaign.employers.length) {
      ctx.addIssue({ code: 'custom', path: ['employers'], message: 'employer ids must be unique' });
    }
    if (employerNames.size !== campaign.employers.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['employers'],
        message: 'employer names must be unique',
      });
    }

    if (legacyRevisions.size !== campaign.legacyRoutes.length) {
      ctx.addIssue({
        code: 'custom', path: ['legacyRoutes'], message: 'legacy route revisions must be unique',
      });
    }

    const victoryIds = [campaign.victoryNodeId, ...campaign.alternateVictoryNodeIds];
    if (new Set(victoryIds).size !== victoryIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['alternateVictoryNodeIds'],
        message: 'victory node ids must be unique',
      });
    }
    for (const [index, victoryId] of victoryIds.entries()) {
      if (ids.has(victoryId)) continue;
      const path = index === 0 ? ['victoryNodeId'] : ['alternateVictoryNodeIds', index - 1];
      ctx.addIssue({
        code: 'custom',
        path,
        message: `"${victoryId}" is not a node in this campaign`,
      });
    }

    campaign.nodes.forEach((node, index) => {
      if (!employerIds.has(node.employerId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes', index, 'employerId'],
          message: `"${node.employerId}" is not an employer in this campaign`,
        });
      }
      for (const required of node.requires) {
        if (!ids.has(required)) {
          ctx.addIssue({
            code: 'custom',
            path: ['nodes', index, 'requires'],
            message: `"${required}" is not a node in this campaign`,
          });
        }
        if (required === node.id) {
          ctx.addIssue({
            code: 'custom',
            path: ['nodes', index, 'requires'],
            message: 'a node cannot require itself',
          });
        }
      }
    });

    campaign.legacyRoutes.forEach((route, routeIndex) => {
      const routeIds = new Set(route.nodes.map((node) => node.id));
      if (route.revision >= campaign.contentRevision) {
        ctx.addIssue({
          code: 'custom', path: ['legacyRoutes', routeIndex, 'revision'],
          message: 'legacy revision must precede the current content revision',
        });
      }
      if (routeIds.size !== route.nodes.length) {
        ctx.addIssue({
          code: 'custom', path: ['legacyRoutes', routeIndex, 'nodes'],
          message: 'legacy route node ids must be unique',
        });
      }
      const victories = [route.victoryNodeId, ...route.alternateVictoryNodeIds];
      for (const [victoryIndex, victoryId] of victories.entries()) {
        if (routeIds.has(victoryId)) continue;
        ctx.addIssue({
          code: 'custom',
          path: ['legacyRoutes', routeIndex,
            victoryIndex === 0 ? 'victoryNodeId' : 'alternateVictoryNodeIds'],
          message: `legacy victory "${victoryId}" is not in that route`,
        });
      }
      route.nodes.forEach((routeNode, nodeIndex) => {
        if (!ids.has(routeNode.id)) {
          ctx.addIssue({
            code: 'custom', path: ['legacyRoutes', routeIndex, 'nodes', nodeIndex, 'id'],
            message: `unknown campaign node "${routeNode.id}"`,
          });
        }
        for (const required of routeNode.requires) {
          if (!routeIds.has(required) || required === routeNode.id) {
            ctx.addIssue({
              code: 'custom', path: ['legacyRoutes', routeIndex, 'nodes', nodeIndex, 'requires'],
              message: `invalid legacy prerequisite "${required}"`,
            });
          }
        }
      });
    });

    campaign.sideWork.employerIds.forEach((employerId, index) => {
      if (employerIds.has(employerId)) return;
      ctx.addIssue({
        code: 'custom',
        path: ['sideWork', 'employerIds', index],
        message: `"${employerId}" is not an employer in this campaign`,
      });
    });

    if (campaign.startingDesignIds.length !== campaign.startingPilotIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['startingPilotIds'],
        message: 'every starting mech needs a starting pilot',
      });
    }
  });

export type Campaign = z.infer<typeof CampaignSchema>;
export type CampaignNode = z.infer<typeof CampaignNodeSchema>;
export type CampaignEmployer = z.infer<typeof CampaignEmployerSchema>;
export type CampaignRoute = z.infer<typeof CampaignRouteSchema>;
