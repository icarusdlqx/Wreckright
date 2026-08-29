import { z } from 'zod';
import { IdSchema } from './common';
import { Factor, NameLike, Probability } from './rulesShared';

export const TerrainTypeSchema = z.strictObject({
  moveMultiplier: z.number().min(0).max(4),
  coverFactor: Factor,
  losObstruction: z.number().min(0).max(4),
  heatDissipationMultiplier: Factor,
  /**
   * How loud a machine standing here is to somebody else's sensors. Kept apart
   * from the hull's own signature on purpose: what a mech is stays with it, and
   * what a treeline hides is left behind when it walks out.
   */
  signatureFactor: Factor,
  /**
   * How far a mech standing here can see. Cover cuts both ways — a treeline
   * you cannot be picked out of is also a treeline you cannot see out of, and
   * without this the woods were pure advantage.
   */
  visionFactor: Factor,
  passable: z.boolean(),
});

const TerrainFireRulesSchema = z.strictObject({
  /** Terrain replacements after a complete burn; absent entries cannot ignite. */
  burnsTo: z.record(IdSchema, IdSchema),
  burnSeconds: z.number().positive().max(300),
  heatPerSecond: z.number().nonnegative().max(100),
  spreadIntervalSeconds: z.number().positive().max(30),
  baseSpreadChance: Probability,
  windSpreadChance: Probability,
  ignitionChance: z.strictObject({
    incendiaryHit: Probability,
    ammoExplosion: Probability,
    artilleryImpact: Probability,
  }),
  maxBurningTiles: z.number().int().positive().max(1024),
});

/** How a mech wants to fight, read off what it is actually carrying. */
export const COMBAT_ROLES = ['brawler', 'skirmisher', 'sniper', 'missile_boat', 'scout'] as const;
export type CombatRole = (typeof COMBAT_ROLES)[number];

const RoleProfileSchema = z.strictObject({
  /** Above 1 the mech presses; below 1 it gives ground and lets others lead. */
  aggression: z.number().positive().max(3),
  /** How far behind the lance's leading edge it prefers to sit, in metres. */
  standoff: z.number().min(-200).max(400),
  /**
   * How heavily return fire counts when choosing a range to fight at. Zero is a
   * machine that maximises its own output and walks into anything; high is one
   * that will only shoot from where it cannot be shot back.
   */
  caution: z.number().nonnegative().max(4),
  /**
   * Share of its terrain-adjusted optical reach a forward observer tries to
   * keep between itself and a contact. Zero means this role fights normally.
   */
  observationRangeFactor: z.number().min(0).max(1),
  /** How far off the lance's direct approach line an observer seeks its perch. */
  observationFlankDegrees: z.number().min(0).max(180),
});

const FireModePolicySchema = z.strictObject({
  short: IdSchema,
  medium: IdSchema,
  long: IdSchema,
});

export const AiRulesSchema = z.strictObject({
  id: z.literal('ai'),
  target: z.strictObject({
    vulnerabilityWeight: z.number().nonnegative(),
    threatWeight: z.number().nonnegative(),
    distancePenaltyPower: z.number().nonnegative().max(4),
    exposurePenaltyWeight: z.number().nonnegative(),
    focusFireBonus: z.number().min(1).max(4),
    switchHysteresis: z.number().min(1).max(4),
    /** Residual priority for a target the shooter must reposition to engage. */
    blockedLineOfFireScoreFactor: Probability,
  }),
  positioning: z.strictObject({
    rangeSampleStep: z.number().positive(),
    rangeTolerance: z.number().positive(),
    repositionStep: z.number().positive(),
    candidateDirections: z.number().int().min(4).max(32),
    coverWeight: z.number().nonnegative(),
    elevationWeight: z.number().nonnegative(),
    flankWeight: z.number().nonnegative(),
    flankAngleDegrees: z.number().positive().max(180),
    spacingRadius: z.number().nonnegative(),
    spacingWeight: z.number().nonnegative(),
    backOffAdvantage: z.number().min(1).max(4),
    dpsWeight: z.number().nonnegative(),
    rangeErrorWeight: z.number().nonnegative(),
    closingWeight: z.number().nonnegative(),
    losPenalty: z.number().nonnegative(),
    commitSeconds: z.number().positive().max(30),
    approachArcDegrees: z.number().positive().max(180),
    approachProgressWeight: z.number().nonnegative(),
    approachExposureWeight: z.number().nonnegative(),
    stationWeight: z.number().nonnegative(),
  }),
  heat: z.strictObject({
    holdFireFraction: Probability,
    resumeFraction: Probability,
    finisherOverrideFraction: Probability,
    sustainFactor: z.number().positive().max(2),
  }),
  withdrawal: z.strictObject({
    structureFraction: Probability,
    resumeStructureFraction: Probability,
    disengageRangeFactor: z.number().min(1).max(4),
    mapEdgeDistance: z.number().positive(),
    losingStrengthRatio: z.number().positive().max(2),
    openRangeWeight: z.number().nonnegative(),
    concealmentBonus: z.number().nonnegative(),
    // Late-battle concession: once this much of the mission clock has burned,
    // a hurt machine on the clearly weaker side quits the field rather than
    // shuffling out a timeout draw nobody enjoys watching.
    endgameClockFraction: Probability,
    endgameStructureFraction: Probability,
    endgameStrengthRatio: z.number().positive().max(2),
  }),
  calledShot: z.strictObject({
    targetStructureFraction: Probability,
    chance: Probability,
  }),
  fireModes: z.record(IdSchema, FireModePolicySchema),
  support: z.strictObject({
    minimumResourceReserve: z.number().int().nonnegative(),
    cooldownSeconds: z.number().positive().max(120),
    artillery: z.strictObject({
      minimumContacts: z.number().int().min(2).max(12),
      clusterRadius: z.number().positive(),
      holdSeconds: z.number().positive().max(120),
    }),
    airStrike: z.strictObject({
      minimumContacts: z.number().int().min(2).max(12),
      clusterRadius: z.number().positive(),
      minimumAdvanceDistance: z.number().positive(),
      advanceAlignment: Probability,
    }),
    sensorProbe: z.strictObject({
      aheadDistance: z.number().positive(),
    }),
    repairTruck: z.strictObject({
      minimumTonnage: z.number().positive(),
      maximumArmourFraction: Probability,
      safeEnemyRange: z.number().positive(),
      behindLineMargin: z.number().nonnegative(),
      holdSeconds: z.number().positive().max(60),
    }),
  }),
  roles: z.strictObject({
    /** A weapon whose long bracket ends here or sooner counts as short-ranged. */
    shortRangeMetres: z.number().positive(),
    /** A weapon whose long bracket reaches this counts as long-ranged. */
    longRangeMetres: z.number().positive(),
    /** At or below this tonnage, a mech without a long-range battery scouts. */
    scoutTonnage: z.number().positive(),
    /** At or above this tonnage, a short-ranged mech brawls rather than skirmishes. */
    brawlerTonnage: z.number().positive(),
    /** Share of a mech's output that has to sit in a bracket to define its role. */
    longShare: Probability,
    indirectShare: Probability,
    shortShare: Probability,
    /** A minimum range this deep says the mech was built to shoot from the back. */
    minimumRangeMetres: z.number().nonnegative(),
    /** Which classified sensor returns are most valuable to a forward observer. */
    observationClassPriority: z.strictObject({
      light: z.number().nonnegative(),
      medium: z.number().nonnegative(),
      heavy: z.number().nonnegative(),
      assault: z.number().nonnegative(),
    }),
    profiles: z.strictObject({
      brawler: RoleProfileSchema,
      skirmisher: RoleProfileSchema,
      sniper: RoleProfileSchema,
      missile_boat: RoleProfileSchema,
      scout: RoleProfileSchema,
    }),
  }),
});

export const TraitSchema = z.strictObject({
  label: NameLike,
  note: z.string().min(1).max(240),
  speedFactor: z.number().positive().max(2).default(1),
  incomingAccuracyFactor: z.number().positive().max(2).default(1),
  movingAccuracyFactor: z.number().positive().max(2).default(1),
  dissipationFactor: z.number().positive().max(2).default(1),
  sensorRangeFactor: z.number().positive().max(2).default(1),
  /** How far the hull's optics can resolve a target. */
  sightRangeFactor: z.number().positive().max(2).default(1),
  /** How loud the machine is to somebody else's sensors. */
  signatureFactor: z.number().positive().max(2).default(1),
  damageTakenFactor: z.number().positive().max(2).default(1),
  legLossFactor: z.number().positive().max(2).default(1),
  lanceAccuracyFactor: z.number().positive().max(2).default(1),
});

export const TraitRulesSchema = z.strictObject({
  id: z.literal('traits'),
  entries: z.record(IdSchema, TraitSchema),
});

export const SensorRulesSchema = z.strictObject({
  id: z.literal('sensors'),
  baseRange: z.number().positive(),
  rangePerSkill: z.number().nonnegative(),
  /** Optical identification range; unlike sensors, this grants a firing solution. */
  sightBaseRange: z.number().positive(),
  sightRangePerSkill: z.number().nonnegative(),
  /** Sensor tracks disclose a grid cell, never a machine's exact coordinates. */
  trackGridMetres: z.number().positive(),
  ghostMemorySeconds: z.number().nonnegative(),
  /**
   * Being seen is a property of the target as much as the observer. A hundred
   * tonnes of reactor and hot plate is a beacon; a scout on a narrow frame has
   * to be walked up on. Signature multiplies the observer's range, so a mech
   * with signature 0.6 must be within 60% of it before anyone notices.
   */
  signatureBase: z.number().positive(),
  signaturePerTon: z.number().nonnegative(),
});

export const TerrainRulesSchema = z.strictObject({
  id: z.literal('terrain'),
  types: z.record(IdSchema, TerrainTypeSchema),
  fire: TerrainFireRulesSchema,
});

export type TerrainRules = z.infer<typeof TerrainRulesSchema>;
export type TerrainFireRules = TerrainRules['fire'];
export type SensorRules = z.infer<typeof SensorRulesSchema>;
export type AiRules = z.infer<typeof AiRulesSchema>;
export type Trait = z.infer<typeof TraitSchema>;
export type TraitRules = z.infer<typeof TraitRulesSchema>;
export type TerrainType = z.infer<typeof TerrainTypeSchema>;
