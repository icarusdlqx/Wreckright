import { z } from 'zod';
import { IdSchema, NameSchema } from './common';

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
  portrait: z.strictObject({
    skin: z.string().regex(/^#[0-9a-f]{6}$/i),
    hair: z.string().regex(/^#[0-9a-f]{6}$/i),
    jacket: z.string().regex(/^#[0-9a-f]{6}$/i),
    accent: z.string().regex(/^#[0-9a-f]{6}$/i),
    style: z.enum(['crop', 'sweep', 'braid', 'shaved', 'curls', 'bob']),
    face: z.enum(['angular', 'broad', 'oval']),
    detail: z.enum(['scar', 'visor', 'earpiece', 'freckles', 'beard', 'none']),
  }).optional(),
});

export type Pilot = z.infer<typeof PilotSchema>;
