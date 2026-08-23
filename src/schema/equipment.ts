import { z } from 'zod';
import { IdSchema, NameSchema } from './common';
import { FactionSchema } from './faction';

export const EquipmentCategorySchema = z.enum([
  'heat_sink',
  'jump_jet',
  'electronics',
  'defensive',
  'targeting',
]);

export type EquipmentCategory = z.infer<typeof EquipmentCategorySchema>;

/**
 * Every field here is consumed by the simulation. Keeping the list strict
 * makes a misspelled or aspirational stat fail content loading instead of
 * appearing in the bay while doing nothing in battle.
 */
export const EquipmentStatsSchema = z.strictObject({
  dissipation: z.number().positive().max(4).optional(),
  jump_distance: z.number().positive().max(200).optional(),
  heat_per_jump: z.number().nonnegative().max(50).optional(),
  sensor_range_factor: z.number().positive().max(4).optional(),
  sight_range_factor: z.number().positive().max(4).optional(),
  signature_factor: z.number().positive().max(4).optional(),
  incoming_accuracy_factor: z.number().positive().max(4).optional(),
  accuracy_factor: z.number().positive().max(4).optional(),
  ams_missile_factor: z.number().positive().max(4).optional(),
  ammo_blast_containment: z.number().min(0).max(1).optional(),
  designator_range: z.number().positive().max(2_000).optional(),
  designator_seconds: z.number().positive().max(120).optional(),
});

export const EquipmentSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  faction: FactionSchema,
  category: EquipmentCategorySchema,
  tonnage: z.number().nonnegative().max(20),
  slots: z.number().int().nonnegative().max(24),
  cost: z.number().int().nonnegative(),
  stats: EquipmentStatsSchema.default({}),
  tags: z.array(IdSchema).default([]),
});

export type Equipment = z.infer<typeof EquipmentSchema>;
export type EquipmentStats = z.infer<typeof EquipmentStatsSchema>;
