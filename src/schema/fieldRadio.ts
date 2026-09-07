import { z } from 'zod';
import content from '../data/dialogue/field_radio.json';
import { FactionSchema } from './faction';

export const OrderCallSchema = z.enum(['move', 'attack', 'guard', 'hold_fire', 'investigate']);
export type OrderCall = z.infer<typeof OrderCallSchema>;
const Line = z.string().min(1).max(200);
export const FieldRadioSchema = z.strictObject({
  routineGapSeconds: z.number().min(5).max(60),
  urgentGapSeconds: z.number().min(1).max(30),
  pressure: z.strictObject({
    windowSeconds: z.number().min(1).max(15),
    minimumHits: z.number().int().min(2).max(10),
    minimumDamage: z.number().positive(),
    cooldownSeconds: z.number().min(20).max(120),
  }),
  displaySeconds: z.strictObject({ routine: z.number().min(3).max(30), story: z.number().min(3).max(30) }),
  lines: z.record(FactionSchema, z.record(OrderCallSchema, z.array(Line).min(1).max(6))),
  alerts: z.strictObject({ shutdown: Line, pilot_ejected: Line, pilot_injured: Line, arm_lost: Line, heavy_fire: Line }),
});
export const FIELD_RADIO = FieldRadioSchema.parse(content);
