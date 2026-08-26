import { z } from 'zod';
import { IdSchema } from './common';
import { TORSO_LOCATIONS } from './design';
import { FactionSchema } from './faction';
import { Factor, NameLike, Probability } from './rulesShared';

/**
 * What a pilot brings that their skill numbers do not. Gunnery says how well
 * someone shoots; a speciality says what they are actually good at — holding a
 * gun steady at a dead run, riding a hot reactor, finding the seam in a hull.
 */
export const PilotTraitSchema = z.strictObject({
  label: NameLike,
  note: z.string().min(1).max(240),
  /** Marksmanship, over and above gunnery. */
  accuracyFactor: z.number().positive().max(2).default(1),
  /** How hard this pilot is to hit — jinking, cover, never standing still. */
  incomingAccuracyFactor: z.number().positive().max(2).default(1),
  /** Shooting on the move, which most pilots are bad at. */
  movingAccuracyFactor: z.number().positive().max(2).default(1),
  /** Running the reactor hotter than the manual allows. */
  dissipationFactor: z.number().positive().max(2).default(1),
  sensorRangeFactor: z.number().positive().max(2).default(1),
  /** Knowing where a hull comes apart. */
  criticalChanceFactor: z.number().positive().max(3).default(1),
  /** Walking away from a wreck they should not have walked away from. */
  survivalFactor: z.number().positive().max(2).default(1),
  /** How fast they learn. */
  xpFactor: z.number().positive().max(2).default(1),
  /**
   * The skill this speciality inclines a pilot toward. Left to themselves,
   * people get better at what they already do — a marksman works on gunnery, a
   * scout on sensors. This used to be a table in roster.ts, which put a balance
   * number in code where nobody tuning the game would look for it.
   */
  speciality: z.enum(['gunnery', 'piloting', 'sensors']).nullable().default(null),
  /**
   * Whether a company can train this into somebody. Some specialities are what
   * a pilot arrived with and cannot be taught.
   */
  trainable: z.boolean().default(false),
});

export const PilotTraitRulesSchema = z.strictObject({
  id: z.literal('pilotTraits'),
  entries: z.record(IdSchema, PilotTraitSchema),
  /**
   * Every skill level at which a pilot has earned the right to a new
   * speciality. Crossing one banks a pick the commander spends, rather than
   * the game deciding for them.
   */
  pickAtTotalSkill: z.array(z.number().int().positive()).default([]),
  /** How many specialities one pilot may ever hold. */
  maxTraits: z.number().int().positive().max(6).default(3),
});

/**
 * One thing a pilot can DO, on a cooldown, as opposed to a trait that quietly
 * multiplies a number all battle. A pilot with a button is a character; a pilot
 * with a modifier is a stat block.
 */
export const AbilitySchema = z.strictObject({
  label: z.string().min(1),
  note: z.string().default(''),
  /** Zero means it happens at once and is over — a coolant dump, not a stance. */
  durationSeconds: z.number().nonnegative().max(60),
  accuracyFactor: z.number().positive().max(3).default(1),
  incomingAccuracyFactor: z.number().positive().max(3).default(1),
  speedFactor: z.number().positive().max(3).default(1),
  sensorRangeFactor: z.number().positive().max(4).default(1),
  damageTakenFactor: z.number().positive().max(2).default(1),
  stabilityFactor: z.number().positive().max(2).default(1),
  /** Share of current heat shed the instant it is used. */
  heatShedFraction: z.number().min(0).max(1).default(0),
});

export const AbilityRulesSchema = z.strictObject({
  id: z.literal('abilities'),
  cooldownSeconds: z.number().positive().max(600),
  entries: z.record(IdSchema, AbilitySchema),
  /** Which ability a pilot earns from a speciality they hold. First match wins. */
  byTrait: z.record(IdSchema, IdSchema).default({}),
  /** What a pilot with no relevant speciality carries instead. */
  default: IdSchema,
});

export const BalanceRulesSchema = z.strictObject({
  id: z.literal('balance'),
  /** How far a weapon may sit from its class median before the report flags it. */
  weaponBandFraction: z.number().positive().max(1),
});

export const DifficultyTierSchema = z.strictObject({
  skillDelta: z.number().int().min(-2).max(3),
  aggression: z.number().positive().max(3),
  lanceSizeDelta: z.number().int().min(-3).max(3),
  focusFire: z.boolean(),
  flanking: z.boolean(),
  coverSeeking: z.boolean(),
  calledShots: z.boolean(),
});

export const DifficultyRulesSchema = z.strictObject({
  id: z.literal('difficulty'),
  default: IdSchema,
  tiers: z.record(IdSchema, DifficultyTierSchema),
});

const SupportCallBase = {
  cost: z.number().int().nonnegative(),
  delaySeconds: z.number().nonnegative().max(60),
};

export const SupportRulesSchema = z.strictObject({
  id: z.literal('support'),
  sensor_probe: z.strictObject({
    ...SupportCallBase,
    radius: z.number().positive(),
    durationSeconds: z.number().positive(),
  }),
  artillery_strike: z.strictObject({
    ...SupportCallBase,
    radius: z.number().positive(),
    damage: z.number().positive(),
    shots: z.number().int().positive().max(24),
    scatter: z.number().nonnegative(),
  }),
  air_strike: z.strictObject({
    ...SupportCallBase,
    length: z.number().positive(),
    width: z.number().positive(),
    damage: z.number().positive(),
    shots: z.number().int().positive().max(24),
  }),
  repair_truck: z.strictObject({
    ...SupportCallBase,
    radius: z.number().positive(),
    armourPerSecond: z.number().positive(),
    durationSeconds: z.number().positive(),
  }),
  minelayer: z.strictObject({
    ...SupportCallBase,
    radius: z.number().positive(),
    mines: z.number().int().positive().max(40),
    damage: z.number().positive(),
    durationSeconds: z.number().positive(),
  }),
  reinforcement: z.strictObject({ ...SupportCallBase }),
});

export const SalvageRulesSchema = z.strictObject({
  id: z.literal('salvage'),
  chassisRecoveryByOutcome: z.strictObject({
    centre_torso: Probability,
    head: Probability,
    ammo_explosion: Probability,
    legged: Probability,
    ejected: Probability,
  }),
  weaponRecoveryMin: Probability,
  weaponRecoveryMax: Probability,
  equipmentRecovery: Probability,
  destroyedLocationRecovery: Probability,
  hulkRebuildCostFraction: z.number().positive().max(1),
  hulkRebuildDays: z.number().int().positive(),
});

export const EconomyRulesSchema = z.strictObject({
  id: z.literal('economy'),
  negotiation: z.strictObject({
    payoutFloorFactor: z.number().positive().max(1),
    payoutCeilingFactor: z.number().min(1).max(4),
    steps: z.literal(3),
  }),
  contractFailure: z.strictObject({
    recoveryDays: z.number().int().positive().max(30),
    recoveryCostFactor: z.number().positive().max(1),
  }),
  repair: z.strictObject({
    // One is the current campaign's field workshop; the default keeps older
    // economy packs valid while making capacity an authored rule.
    bayCapacity: z.number().int().positive().max(8).default(1),
    armourCostPerPoint: z.number().nonnegative(),
    internalCostPerPoint: z.number().nonnegative(),
    locationReplaceCostFraction: z.number().nonnegative().max(1),
    armourPointsPerDay: z.number().positive(),
    internalPointsPerDay: z.number().positive(),
    locationReplaceDays: z.number().nonnegative(),
    minimumDays: z.number().int().nonnegative(),
    factionFactors: z.strictObject({
      linewrought: z.strictObject({ cost: Factor, days: Factor }),
      aurelian: z.strictObject({ cost: Factor, days: Factor }),
    }),
  }),
  pilot: z.strictObject({
    hireCostBase: z.number().nonnegative(),
    hireCostPerSkillPoint: z.number().nonnegative(),
    salaryPerDay: z.number().nonnegative(),
    injuryDaysBase: z.number().int().nonnegative(),
    injuryDaysPerWound: z.number().int().nonnegative(),
    injuryChanceOnMechLoss: Probability,
    deathChanceOnMechLoss: Probability,
  }),
  xp: z.strictObject({
    perHit: z.number().nonnegative(),
    perDamageDealt: z.number().nonnegative(),
    perKill: z.number().nonnegative(),
    missionSurvival: z.number().nonnegative(),
    missionWin: z.number().nonnegative(),
    skillCostBase: z.number().positive(),
    skillCostGrowth: z.number().min(1).max(5),
  }),
  /**
   * The yard. Machines used to enter the company only by salvage and never
   * leave it, which made a mech the one asset with no price on it.
   */
  market: z.strictObject({
    /** What the yard pays for a machine, against what it is worth new. */
    sellFraction: z.number().positive().max(1),
    refreshDays: z.number().int().positive().max(60),
    listings: z.number().int().positive().max(8),
    /** Loose weapons and gear on the counter each week, priced per crate. */
    partListings: z.number().int().positive().max(12),
    priceVariance: z.tuple([z.number().positive(), z.number().positive()]),
    priceRounding: z.number().int().positive(),
    /** Crates round to workshop money, not to mech money. */
    partPriceRounding: z.number().int().positive(),
    /** Odds a listing is somebody's tired machine rather than a refurbished one. */
    wornChance: Probability,
    wornDiscount: z.number().positive().max(1),
    /** The yard can only source machines and loose parts made by these shops. */
    availableFactions: z.array(FactionSchema).min(1),
  }),
  /**
   * Work the hiring hall is posting this week. Side contracts exist so a
   * company that is not ready for the next authored job has something to do
   * besides watch the calendar: they pay less per tonne of opposition than the
   * campaign does, and they are the only work that renews.
   */
  sideContracts: z.strictObject({
    /** How often the board turns over. Offers are derived from the period. */
    refreshDays: z.number().int().positive().max(60),
    offersPerPeriod: z.number().int().positive().max(6),
    payoutPerOpposingTon: z.number().positive(),
    /** Extra for a job that outweighs what the dropship can carry to it. */
    overmatchBonusFactor: z.number().nonnegative().max(4),
    payoutVariance: z.tuple([z.number().positive(), z.number().positive()]),
    payoutRounding: z.number().int().positive(),
    salvageShare: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
    deadlineDays: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  }),
});

export const ConstructionRulesSchema = z.strictObject({
  id: z.literal('construction'),
  engineWeightByRating: z.record(z.string().regex(/^\d+$/), z.number().positive()),
  structureWeightFraction: z.number().positive().max(1),
  armourPointsPerTon: z.number().positive(),
  ammoSlotsPerTon: z.number().positive(),
  /**
   * A design's armour number remains the whole paid plating. This is the
   * fallback split for older designs and saves that do not persist exact rear
   * points, plus named starting allocations for new bay edits.
   */
  rearArmour: z.strictObject({
    fraction: z.number().positive().max(0.5),
    /** Only the torsos have a back. A leg is a leg from any angle. */
    locations: z.array(z.enum(TORSO_LOCATIONS)),
    /** Named starting points for the bay; designs still persist exact points. */
    presets: z.array(z.strictObject({
      id: IdSchema,
      label: NameLike,
      fraction: z.number().nonnegative().max(0.5),
    })).min(1),
  }),
  /**
   * Upper tonnage of a size-1, size-2 and size-3 weapon; anything heavier is
   * size 4. A mount is built around the gun it was meant to carry — the cradle,
   * the feed, the recoil path — so what stops a light chassis taking a gauss
   * rifle is not only tonnage but whether the hardpoint can hold one at all.
   */
  weaponSizeTonnage: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
  /** What each size is called where the player reads it. */
  weaponSizeLabels: z.tuple([z.string(), z.string(), z.string(), z.string()]),
});

export type ConstructionRules = z.infer<typeof ConstructionRulesSchema>;
export type SalvageRules = z.infer<typeof SalvageRulesSchema>;
export type EconomyRules = z.infer<typeof EconomyRulesSchema>;
export type SupportRules = z.infer<typeof SupportRulesSchema>;
export type BalanceRules = z.infer<typeof BalanceRulesSchema>;
export type PilotTrait = z.infer<typeof PilotTraitSchema>;
export type PilotTraitRules = z.infer<typeof PilotTraitRulesSchema>;
export type AbilityRules = z.infer<typeof AbilityRulesSchema>;
export type Ability = z.infer<typeof AbilitySchema>;
export type DifficultyRules = z.infer<typeof DifficultyRulesSchema>;
export type DifficultyTier = z.infer<typeof DifficultyTierSchema>;
