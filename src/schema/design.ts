import { z } from 'zod';
import { IdSchema, MechLocationSchema, NameSchema, perLocation } from './common';

export const TORSO_LOCATIONS = [
  'centre_torso',
  'left_torso',
  'right_torso',
] as const;
export type TorsoLocation = (typeof TORSO_LOCATIONS)[number];

export const TorsoRearArmourSchema = z.strictObject({
  centre_torso: z.number().int().nonnegative(),
  left_torso: z.number().int().nonnegative(),
  right_torso: z.number().int().nonnegative(),
});

export const WeaponMountSchema = z.strictObject({
  weaponId: IdSchema,
  location: MechLocationSchema,
  modeId: IdSchema.optional(),
});

export const AmmoLoadSchema = z.strictObject({
  weaponId: IdSchema,
  location: MechLocationSchema,
  tons: z.number().int().positive().max(10),
});

export const EquipmentFitSchema = z.strictObject({
  equipmentId: IdSchema,
  location: MechLocationSchema,
});

export const DesignSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  chassisId: IdSchema,
  armour: perLocation(z.number().int().nonnegative()),
  /**
   * Armour remains one paid total per location. A present allocation says how
   * much of each torso total faces backwards; absence preserves the authored
   * construction-rule split used by designs and saves from before refitting.
   */
  rearArmour: TorsoRearArmourSchema.optional(),
  heatSinkId: IdSchema,
  heatSinks: z.number().int().min(1).max(40),
  mounts: z.array(WeaponMountSchema).min(1).max(24),
  ammo: z.array(AmmoLoadSchema).max(12).default([]),
  equipment: z.array(EquipmentFitSchema).max(12).default([]),
}).superRefine((design, context) => {
  if (design.rearArmour === undefined) return;
  for (const location of TORSO_LOCATIONS) {
    const rear = design.rearArmour[location];
    const total = design.armour[location];
    if (rear <= total) continue;
    context.addIssue({
      code: 'custom',
      path: ['rearArmour', location],
      message: `${rear} rear armour exceeds ${total} total armour`,
    });
  }
});

export type Design = z.infer<typeof DesignSchema>;
export type WeaponMountSpec = z.infer<typeof WeaponMountSchema>;
export type AmmoLoadSpec = z.infer<typeof AmmoLoadSchema>;
