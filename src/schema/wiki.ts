import { z } from 'zod';
import { IdSchema } from './common';
import { FactionSchema } from './faction';

export const WikiReferenceSchema = z.strictObject({ kind: z.enum(['story', 'mech']), id: IdSchema });
export type WikiReference = z.infer<typeof WikiReferenceSchema>;
export const WikiSectionSchema = z.strictObject({
  heading: z.string().min(1).max(120),
  body: z.array(z.string().min(1).max(1200)).min(1).max(12),
});
export const WikiStorySchema = z.strictObject({
  id: IdSchema,
  category: z.enum(['world', 'history', 'factions', 'places', 'workshop']),
  faction: FactionSchema.optional(),
  sourceLoreId: IdSchema.optional(),
  title: z.string().min(1).max(120).optional(),
  summary: z.string().min(1).max(240).optional(),
  sections: z.array(WikiSectionSchema).min(1).max(12).optional(),
  related: z.array(WikiReferenceSchema).max(6),
}).superRefine((record, context) => {
  const authored = record.title !== undefined && record.summary !== undefined && record.sections !== undefined;
  const wrapper = record.title === undefined && record.summary === undefined && record.sections === undefined;
  if (record.sourceLoreId === undefined ? !authored : !wrapper) {
    context.addIssue({ code: 'custom', message: 'Use either one canonical lore source or a complete original article.' });
  }
});
export type WikiStoryRecord = z.infer<typeof WikiStorySchema>;
export const WikiMechSchema = z.strictObject({
  id: IdSchema,
  designId: IdSchema,
  provenance: z.string().min(1).max(400),
  serviceHistory: z.array(z.string().min(1).max(1200)).min(2).max(4),
  fieldNotes: z.string().min(1).max(600),
  related: z.array(WikiReferenceSchema).max(6),
});
export type WikiMechRecord = z.infer<typeof WikiMechSchema>;
