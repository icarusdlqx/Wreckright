import { z } from 'zod';
import { DesignSchema, WeaponMountSchema } from '../schema/design';
import { IdSchema, MechLocationSchema, perLocation } from '../schema/common';
import { EMPLOYER_FAILURE_LIMIT } from './employers';

export const SAVE_VERSION = 1;

const LocationConditionSchema = z.strictObject({
  armour: z.number().nonnegative(),
  // Saves written before mechs had a back load with the rear plate stripped;
  // the first trip through the workshop puts it right.
  rearArmour: z.number().nonnegative().default(0),
  internal: z.number().nonnegative(),
  destroyed: z.boolean(),
});

// Catalogue designs always carry a weapon. A recovered campaign hull is a
// different state: it may be stored, rebuilt and saved before the company fits
// its first gun. Keep that exception local to campaign persistence rather than
// weakening authored-design validation.
const StoredDesignSchema = DesignSchema.safeExtend({
  mounts: z.array(WeaponMountSchema).max(24),
});

const MechRecordSchema = z.strictObject({
  id: z.string().min(1),
  design: StoredDesignSchema,
  condition: perLocation(LocationConditionSchema),
  status: z.enum(['ready', 'repairing', 'hulk']),
  readyOnDay: z.number().int(),
  rebuildCost: z.number().nonnegative(),
});

const PilotRecordSchema = z.strictObject({
  id: z.string().min(1),
  templateId: IdSchema,
  name: z.string().min(1),
  gunnery: z.number().int().min(1).max(5),
  piloting: z.number().int().min(1).max(5),
  sensors: z.number().int().min(1).max(5),
  xp: z.number().nonnegative(),
  spentXp: z.number().nonnegative(),
  traits: z.array(IdSchema),
  // Saves written before the register carried biographies still load.
  bio: z.string().default(''),
  injuredUntilDay: z.number().int(),
  recoveryMissions: z.number().int().nonnegative().default(0),
  dead: z.boolean(),
  mechId: z.string().nullable(),
});

const StoreItemSchema = z.strictObject({
  kind: z.enum(['weapon', 'equipment']),
  itemId: IdSchema,
  count: z.number().int().positive(),
});

const SalvageOutcomeSchema = z.enum([
  'centre_torso',
  'head',
  'ammo_explosion',
  'legged',
  'ejected',
]);

const SalvageCandidateSchema = z.strictObject({
  designId: IdSchema,
  name: z.string().min(1),
  outcome: SalvageOutcomeSchema,
  chassisChance: z.number().min(0).max(1),
  recovered: z.boolean(),
});

const SalvageProvenanceSchema = z.strictObject({
  kind: z.enum(['weapon', 'equipment']),
  itemId: IdSchema,
  sourceDesignId: IdSchema,
  sourceMechName: z.string().min(1),
  location: MechLocationSchema,
});

const ContractTermsSchema = z.enum(['fee_first', 'standard', 'salvage_first']);

const ContractSchema = z.strictObject({
  nodeId: IdSchema,
  missionId: IdSchema,
  employerId: IdSchema,
  employerName: z.string().min(1),
  // Old contracts load on the middle terms; their stored payout and salvage
  // still remain authoritative.
  termsId: ContractTermsSchema.default('standard'),
  payout: z.number().int(),
  salvageShare: z.number().min(0).max(1),
  acceptedOnDay: z.number().int(),
  deadlineDay: z.number().int(),
});

const MissionOutcomeSchema = z.strictObject({
  nodeId: IdSchema,
  missionId: IdSchema,
  employerId: IdSchema,
  employerName: z.string().min(1),
  // Old debriefs predate named packages but already carry the exact proceeds.
  termsId: ContractTermsSchema.default('standard'),
  won: z.boolean(),
  day: z.number().int(),
  payout: z.number().int(),
  // Historical reports predate event adjustments and retain their final ledgers.
  paymentDisputeSettled: z.boolean().default(true),
  salvagedChassis: z.array(IdSchema),
  salvagedItems: z.array(StoreItemSchema),
  /** Older saves predate the salvage choice and simply offered nothing. */
  salvageOffered: z.array(StoreItemSchema).default([]),
  // Reports saved before the receipt existed have already passed their debrief.
  salvageFinalized: z.boolean().default(true),
  // A missing ledger means the old debrief never recorded the field rolls.
  salvageCandidates: z.array(SalvageCandidateSchema).default([]),
  salvageProvenance: z.array(SalvageProvenanceSchema).default([]),
  campaignRewards: z.array(z.strictObject({
    id: z.string().min(1), label: z.string().min(1).max(100), items: z.array(StoreItemSchema),
    hulls: z.array(z.strictObject({ mechId: z.string().min(1), designId: IdSchema })),
    freeRepairDays: z.number().int().nonnegative().max(7),
    freeRepairDaysOffered: z.number().int().nonnegative().max(7).optional(),
    supplierDiscountThroughDay: z.number().int().nonnegative().nullable(),
    afterword: z.string().max(500),
  })).max(8).optional(),
  objectiveReports: z.array(z.strictObject({ id: IdSchema, label: z.string(), required: z.boolean(), status: z.string() })).optional(),
  pilotCasualties: z.array(z.string()),
  mechsLost: z.array(z.string()),
  // Saves written before debriefs were recorded load with none.
  pilotReports: z
    .array(
      z.strictObject({
        pilotId: z.string().min(1),
        name: z.string().min(1),
        mech: z.string(),
        mechId: z.string().min(1).optional(),
        chassisId: IdSchema.optional(),
        kills: z.number().nonnegative(),
        damage: z.number().nonnegative(),
        xp: z.number(),
        // Older debriefs did not snapshot the pilot's bank after a drop.
        xpBanked: z.number().nonnegative().nullable().default(null),
        sharedXp: z.number().int().nonnegative().optional(),
        serviceNotes: z.array(z.string().max(600)).max(6).optional(),
        promotions: z.array(z.string()),
        fate: z.enum(['returned', 'injured', 'killed']),
      }),
    )
    .default([]),
});

const EmployerFailureSchema = z.strictObject({
  employerId: IdSchema,
  employerName: z.string().min(1),
  day: z.number().int().nonnegative(),
  reason: z.enum(['withdrawn', 'expired']),
  count: z.number().int().positive().default(1),
});

const EmployerOutcomeSummarySchema = z.strictObject({
  employerName: z.string().min(1),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  paid: z.number().int(),
});

const CampaignHistoryArchiveSchema = z.strictObject({
  outcomes: z.number().int().nonnegative(),
  employers: z.record(IdSchema, EmployerOutcomeSummarySchema),
});

const RngStateSchema = z.strictObject({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  z: z.number().int().nonnegative(),
  w: z.number().int().nonnegative(),
});

const CampaignEventEffectsSchema = z.strictObject({
  supplierDiscountThroughDay: z.number().int().nonnegative().nullable(),
  freeRepairDays: z.number().int().nonnegative().max(7),
});

export const CampaignStateSchema = z.strictObject({
  campaignId: IdSchema,
  // Older campaigns used the normal simulation tier; freeze that rule on load.
  difficulty: z.enum(['green', 'regular', 'veteran', 'elite']).default('regular'),
  difficultyConfigured: z.boolean().default(true),
  seed: z.string(),
  rng: RngStateSchema,
  day: z.number().int().nonnegative(),
  cbills: z.number().int(),
  mechs: z.array(MechRecordSchema),
  pilots: z.array(PilotRecordSchema),
  // Saves written before the commander could hold anyone back load with
  // nobody benched, which is what they meant.
  benched: z.array(z.string()).default([]),
  deploymentSelection: z.array(z.string().min(1)).max(12).nullable().default(null),
  deploymentSeats: z.array(z.strictObject({
    mechId: z.string().min(1).nullable(), pilotId: z.string().min(1).nullable(),
  })).max(12).nullable().default(null),
  lancePresets: z.array(z.strictObject({
    name: z.string().trim().min(1).max(40),
    seats: z.array(z.strictObject({ pilotId: z.string().min(1), mechId: z.string().nullable() })).max(12),
  })).max(6).default([]),
  claimedRewardIds: z.array(z.string().min(1)).default([]),
  sharedXpClaims: z.array(z.strictObject({ key: z.string().min(1), xp: z.number().int().nonnegative() })).default([]),
  store: z.array(StoreItemSchema),
  completedNodes: z.array(IdSchema),
  failedNodes: z.array(IdSchema),
  // Saves written before the hiring hall existed have nothing signed at it.
  sideTaken: z.array(IdSchema).default([]),
  // Saves written before the yard existed have bought nothing from it.
  marketBought: z.array(IdSchema).default([]),
  contract: ContractSchema.nullable(),
  history: z.array(MissionOutcomeSchema),
  historyArchive: CampaignHistoryArchiveSchema.default({ outcomes: 0, employers: {} }),
  employerFailures: z.array(EmployerFailureSchema).max(EMPLOYER_FAILURE_LIMIT).default([]),
  eventEffects: CampaignEventEffectsSchema.default({
    supplierDiscountThroughDay: null,
    freeRepairDays: 0,
  }),
  log: z.array(z.strictObject({ day: z.number().int(), text: z.string() })),
  finished: z.boolean(),
  won: z.boolean(),
  nextId: z.number().int().positive(),
});

export const SaveFileSchema = z.strictObject({
  version: z.literal(SAVE_VERSION),
  state: CampaignStateSchema,
});

export type SaveFile = z.infer<typeof SaveFileSchema>;
