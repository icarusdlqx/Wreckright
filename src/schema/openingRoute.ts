import { z } from 'zod';
import { IdSchema } from './common';

const OpeningRouteLinkSchema = z.strictObject({
  kind: z.enum(['story', 'mech']),
  id: IdSchema,
  label: z.string().min(1).max(70),
});

const OpeningRouteStepSchema = z.strictObject({
  nodeId: IdSchema,
  purpose: z.string().min(1).max(350),
  practice: z.string().min(1).max(240),
  links: z.array(OpeningRouteLinkSchema).min(1).max(3),
});

export const OpeningRouteSchema = z.strictObject({
  campaignId: IdSchema,
  title: z.string().min(1).max(70),
  steps: z.array(OpeningRouteStepSchema).length(3),
}).superRefine((route, ctx) => {
  if (new Set(route.steps.map((step) => step.nodeId)).size !== route.steps.length) {
    ctx.addIssue({ code: 'custom', path: ['steps'], message: 'opening route steps must be unique' });
  }
});

export const OpeningRoutesSchema = z.array(OpeningRouteSchema).min(1).superRefine((routes, ctx) => {
  if (new Set(routes.map((route) => route.campaignId)).size !== routes.length) {
    ctx.addIssue({ code: 'custom', message: 'opening routes must name different campaigns' });
  }
});

export type OpeningRoute = z.infer<typeof OpeningRouteSchema>;
export type OpeningRouteStep = z.infer<typeof OpeningRouteStepSchema>;
