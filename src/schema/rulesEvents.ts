import { z } from 'zod';
import { IdSchema } from './common';
import { NameLike } from './rulesShared';

export const REST_DAY_EVENT_TYPES = [
  'supplier_discount',
  'pilot_rumour',
  'yard_mishap',
  'contract_payment_dispute',
] as const;

const EventBase = {
  id: IdSchema,
  title: NameLike,
  log: z.string().min(1).max(240),
  weight: z.number().int().positive().max(100),
};

export const RestDayEventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...EventBase,
    type: z.literal('supplier_discount'),
    priceFactor: z.number().min(0.8).lt(1),
    durationDays: z.number().int().positive().max(30),
  }),
  z.strictObject({
    ...EventBase,
    type: z.literal('pilot_rumour'),
    xp: z.number().int().positive().max(200),
  }),
  z.strictObject({
    ...EventBase,
    type: z.literal('yard_mishap'),
    freeRepairDays: z.literal(1),
    bankLimit: z.number().int().positive().max(7),
  }),
  z.strictObject({
    ...EventBase,
    type: z.literal('contract_payment_dispute'),
    settlementCredits: z.number().int().positive().max(100_000),
  }),
]);

export const EventsRulesSchema = z
  .strictObject({
    id: z.literal('events'),
    entries: z.array(RestDayEventSchema).length(REST_DAY_EVENT_TYPES.length),
  })
  .superRefine((rules, ctx) => {
    const ids = rules.entries.map((entry) => entry.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['entries'],
        message: 'event ids must be unique',
      });
    }

    const types = rules.entries.map((entry) => entry.type);
    if (new Set(types).size !== REST_DAY_EVENT_TYPES.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['entries'],
        message: 'events must contain exactly one entry of each supported type',
      });
    }
  });

export type RestDayEvent = z.infer<typeof RestDayEventSchema>;
export type EventsRules = z.infer<typeof EventsRulesSchema>;
