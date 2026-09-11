import { z } from 'zod';
import { IdSchema, NameSchema } from './common';
import { PilotPersonalitySchema } from './pilotPersonality';
import { PilotAppearanceSchema } from './pilotAppearance';

const SkillSchema = z.number().int().min(1).max(5);

export const PilotSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  gunnery: SkillSchema,
  piloting: SkillSchema,
  sensors: SkillSchema,
  traits: z.array(IdSchema).default([]),
  /** Who this person is, in the two sentences a hiring hall would give you. */
  bio: z.string().min(1).max(400).default(''),
  /** Authored voice is cosmetic; saved crews resolve it from their template. */
  personality: PilotPersonalitySchema.optional(),
  portrait: PilotAppearanceSchema.optional(),
});

export type Pilot = z.infer<typeof PilotSchema>;
