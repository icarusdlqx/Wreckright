import { z } from 'zod';

export const PilotCallSchema = z.enum(['move', 'attack', 'guard', 'hold_fire', 'investigate', 'heavy_fire']);
export type PilotCall = z.infer<typeof PilotCallSchema>;

export const PilotPersonalitySchema = z.strictObject({
  label: z.string().min(1).max(40),
  description: z.string().min(1).max(200),
  lines: z.record(PilotCallSchema, z.array(z.string().min(1).max(160)).min(1).max(6)),
});
export type PilotPersonality = z.infer<typeof PilotPersonalitySchema>;
