import { z } from 'zod';
import content from '../data/dialogue/pilot_continuity.json';
import { FactionSchema } from './faction';

const Lines = z.strictObject({
  return: z.string().min(1).max(160),
  refit: z.string().min(1).max(160),
  recovered_weapon: z.string().min(1).max(160),
  revisit: z.string().min(1).max(160),
});
export const PilotContinuitySchema = z.strictObject({
  maxPerMission: z.number().int().min(1).max(3),
  fallback: z.record(FactionSchema, Lines),
  pilots: z.record(z.string(), Lines),
});
export const PILOT_CONTINUITY = PilotContinuitySchema.parse(content);
