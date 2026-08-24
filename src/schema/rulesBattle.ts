import { z } from 'zod';
import { MechLocationSchema, perLocation } from './common';
import { Factor, Probability } from './rulesShared';

const MotionFactorsSchema = z.strictObject({
  stationary: Factor,
  walk: Factor,
  run: Factor,
  jump: Factor,
});

export const SimulationRulesSchema = z.strictObject({
  id: z.literal('simulation'),
  tickRate: z.number().int().min(1).max(120),
  aiDecisionIntervalTicks: z.number().int().positive(),
  aiPathIntervalTicks: z.number().int().positive(),
  maxBattleTicks: z.number().int().positive(),
  pathfindMaxNodes: z.number().int().positive(),
});

export const MovementRulesSchema = z.strictObject({
  id: z.literal('movement'),
  walkSpeedFactor: z.number().positive(),
  runMultiplier: z.number().min(1),
  turnRateDegreesPerSecond: z.number().positive(),
  turnRateReferenceTonnage: z.number().positive(),
  singleLegSpeedFactor: Probability,
  /** Pace retained per elevation level while moving across high ground. */
  elevationSpeedPerLevel: z.number().positive().max(1),
  /** Caps the plateau penalty on maps with extreme authored relief. */
  elevationSpeedMaxLevels: z.number().int().min(0).max(9),
  jumpDistancePerJet: z.number().positive(),
  jumpHeatPerJet: z.number().nonnegative(),
  jumpCooldownSeconds: z.number().positive(),
  /** Ground speed while airborne. Sets how long a mech spends off the ground. */
  jumpSpeed: z.number().positive(),
  /**
   * Speed multiplier for walking straight backwards, tapering to 1 head-on.
   * A mech holding its nose on a target while it repositions is crabbing, and
   * that costs pace.
   */
  offAxisSpeedFactor: Factor,
  moveAlignmentDegrees: z.number().positive().max(180),
  torsoTwistDegrees: z.number().positive().max(180),
  torsoTurnRateDegreesPerSecond: z.number().positive(),
  waypointRadius: z.number().positive(),
  arrivalRadius: z.number().positive(),
  /**
   * How much nearer a mech has to get to its waypoint to count as making
   * progress, and how many ticks of not making it before the path is judged
   * hopeless and dropped for whoever gave it to re-solve.
   */
  progressEpsilon: z.number().positive(),
  stallTicks: z.number().int().positive(),
  /**
   * What a full level of climb costs, as a share of pace. Ground that rises
   * under a mech should be felt: without this a ridge is a painted backdrop
   * that costs nothing to walk up.
   */
  climbSpeedFactor: z.number().min(0).max(1),
  /**
   * How much room a mech takes up on the ground, so two of them cannot stand
   * in the same spot. These have to agree with the radius the renderer draws a
   * hull at, or mechs visibly overlap while the simulation believes they are
   * clear of one another; a test holds the two together.
   */
  bodyRadiusBase: z.number().positive(),
  bodyRadiusPerTon: z.number().positive(),
  /**
   * Share of an overlap pushed out per tick. Below one, contact is a shove
   * rather than a snap, so two mechs squeezing through a gap ease past each
   * other instead of being fired apart.
   */
  separationRate: Factor,
});

/** Which side of a mech a shot came in on. */
export const ATTACK_ARCS = ['front', 'side', 'rear'] as const;
export type AttackArc = (typeof ATTACK_ARCS)[number];

/**
 * Hit locations named relative to the shot rather than to the mech, so one
 * table serves both flanks. "near" is the side the fire is coming from.
 */
const ArcHitWeightsSchema = z.strictObject({
  head: z.number().nonnegative(),
  centre_torso: z.number().nonnegative(),
  near_torso: z.number().nonnegative(),
  far_torso: z.number().nonnegative(),
  near_arm: z.number().nonnegative(),
  far_arm: z.number().nonnegative(),
  near_leg: z.number().nonnegative(),
  far_leg: z.number().nonnegative(),
});

export const ArcProfileSchema = z.strictObject({
  /** Multiplies incoming damage. Rear plating is thinner than the glacis. */
  damageFactor: z.number().positive().max(4),
  hitLocationWeights: ArcHitWeightsSchema,
});

export const FRAMES = ['mech', 'vehicle', 'turret'] as const;
export const FrameSchema = z.enum(FRAMES);
export type Frame = z.infer<typeof FrameSchema>;

/**
 * What kind of machine a hull is, and what being one changes.
 *
 * The mech profile is deliberately not restated here: `arcs: null` means "the
 * arcs already in combat.json" and `twistFactor` scales the one twist limit in
 * movement.json. A weighted draw walks its table in order, so any reordering of
 * the mech tables would move every hit location in every battle; expressing the
 * other frames as additions rather than as a replacement set is what makes this
 * file provably unable to do that.
 */
const FrameProfileSchema = z.strictObject({
  label: z.string().min(1),
  /** How strongly this kind of machine returns on a sensor scope. */
  sensorSignatureFactor: z.number().positive().max(2).default(1),
  /** Whether the hull can move under its own power at all. */
  mobile: z.boolean(),
  /** Whether it can be shoved off its feet. Tracks and concrete cannot. */
  knockable: z.boolean(),
  /** A turret ring traverses further than a waist does. */
  twistFactor: z.number().positive().max(4),
  arcs: z
    .strictObject({
      front: ArcProfileSchema,
      side: ArcProfileSchema,
      rear: ArcProfileSchema,
    })
    .nullable(),
});

export const FrameRulesSchema = z.strictObject({
  id: z.literal('frames'),
  entries: z.strictObject({
    mech: FrameProfileSchema,
    vehicle: FrameProfileSchema,
    turret: FrameProfileSchema,
  }),
});

export const CombatRulesSchema = z.strictObject({
  id: z.literal('combat'),
  gunneryBase: z.array(Probability).length(5),
  rangeFactor: z.strictObject({
    short: Factor,
    medium: Factor,
    long: Factor,
    beyond: Factor,
  }),
  shooterMotion: MotionFactorsSchema,
  targetMotion: MotionFactorsSchema,
  minimumRangeFactor: Factor,
  maxRangeMultiplier: z.number().min(1),
  firingArcDegrees: z.number().positive().max(360),
  hitChanceFloor: Probability,
  hitChanceCeiling: Probability,
  /** Used by fire that arrives from above — artillery, air strikes, mines. */
  hitLocationWeights: perLocation(z.number().nonnegative()),
  /**
   * Where a shot lands and what it does depends on the side it came in on.
   * The two arc widths are measured across the nose and across the tail; what
   * is left over on each flank is the side arc.
   */
  attackArcs: z.strictObject({
    frontDegrees: z.number().positive().max(360),
    rearDegrees: z.number().positive().max(360),
    front: ArcProfileSchema,
    side: ArcProfileSchema,
    rear: ArcProfileSchema,
  }),
  calledShot: z.strictObject({
    accuracyFactor: Factor,
    locationChance: Probability,
  }),
  tagFactor: Factor,
  /**
   * Shooting downhill. A mech on the high ground sees more of what it is aiming
   * at and less of the ground in front of it; the cap stops a four-level map
   * turning a ridge into a firing range.
   */
  elevation: z.strictObject({
    accuracyPerLevel: Factor,
    maxLevels: z.number().int().min(0).max(9),
    /** What a level of height adds to how far a mech can see from it. */
    visionPerLevel: Factor,
    /** Extra usable weapon reach per level when firing downhill. */
    rangePerLevel: z.number().min(1).max(2),
    /** Relief needed before an embankment counts as high ground for reach. */
    rangeMinimumLevels: z.number().int().min(1).max(9),
    /** Hard ceiling on the downhill weapon-reach bonus. */
    rangeMaxFactor: z.number().min(1).max(2),
  }),
  /** How long a mech under return-fire orders remembers who shot at it. */
  returnFireSeconds: z.number().positive(),
});

export const HeatTierSchema = z.strictObject({
  fraction: z.number().min(0).max(2),
  movementFactor: Factor,
  accuracyFactor: Factor,
  shutdownChancePerSecond: Probability,
  ammoExplosionChancePerSecond: Probability,
  forcedShutdown: z.boolean(),
});

export const HeatRulesSchema = z
  .strictObject({
    id: z.literal('heat'),
    /** How long an alpha strike ignores the capacity gate, and its cooldown. */
    alphaStrikeSeconds: z.number().positive().max(10).default(1.5),
    alphaStrikeCooldownSeconds: z.number().positive().max(120).default(20),
    capacityBase: z.number().positive(),
    capacityPerSink: z.number().nonnegative(),
    dissipationPerSinkPerSecond: z.number().positive(),
    shutdownSeconds: z.number().positive(),
    pilotingOverrideFactor: z.number().min(0).max(0.5),
    tiers: z.array(HeatTierSchema).min(1),
  })
  .superRefine((rules, ctx) => {
    const first = rules.tiers[0];
    if (first === undefined || first.fraction !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['tiers', 0],
        message: 'the first heat tier must start at fraction 0 so every heat level resolves',
      });
    }
    for (let index = 1; index < rules.tiers.length; index += 1) {
      const previous = rules.tiers[index - 1];
      const current = rules.tiers[index];
      if (previous !== undefined && current !== undefined && current.fraction <= previous.fraction) {
        ctx.addIssue({
          code: 'custom',
          path: ['tiers', index, 'fraction'],
          message: 'heat tiers must be listed in ascending order of fraction',
        });
      }
    }
  });

export const DamageRulesSchema = z
  .strictObject({
    id: z.literal('damage'),
    transfer: perLocation(MechLocationSchema.nullable()),
    ammoExplosionDamagePerRound: z.number().nonnegative(),
    ammoExplosionCap: z.number().positive(),
    volatileExplosionFactor: z.number().nonnegative(),
    headDestroyedEjectionChance: Probability,
    /**
     * What happens when a shot gets past the plate and into the frame. A
     * critical is not simply more damage: it is the shot that finds the thing
     * behind the armour, which is why it can silence a weapon the mech was
     * relying on rather than just shortening the fight.
     */
    critical: z.strictObject({
      /** Damage multiplier on the penetrating shot itself. */
      damageMultiplier: z.number().min(1).max(5),
      /** Chance the crit also wrecks something fitted in that location. */
      componentChance: Probability,
      /** A ruined leg actuator, as a share of the mech's pace. */
      actuatorSpeedFactor: Factor,
      /** A ruined arm actuator, as a share of the mech's gunnery. */
      actuatorAccuracyFactor: Factor,
      /** A wrecked sensor head, as a share of the mech's gunnery. */
      sensorAccuracyFactor: Factor,
    }),
  })
  .superRefine((rules, ctx) => {
    if (rules.transfer.centre_torso !== null || rules.transfer.head !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['transfer'],
        message: 'head and centre_torso must terminate the transfer chain (null)',
      });
    }
  });

/**
 * How hard a mech is to knock off its feet. Stability is a pool of shove that
 * builds from big single hits and bleeds away on its own; crossing the first
 * threshold staggers, crossing the second while already staggered puts the mech
 * on the ground. Nothing goes from steady to floored in one shot, so being
 * knocked down is always something the player saw coming.
 */
export const StabilityRulesSchema = z
  .strictObject({
    id: z.literal('stability'),
    /** What a single hit has to land before it shoves rather than scratches. */
    impactFloor: z.number().nonnegative(),
    /** How much a weapon's recoil multiplies its shove. Zero ignores recoil. */
    recoilWeight: z.number().nonnegative().max(4),
    /** The tonnage that takes shove at face value; heavier mechs take less. */
    referenceTonnage: z.number().positive(),
    pilotingResistFactor: z.number().min(0).max(0.2),
    staggerThreshold: z.number().positive(),
    knockdownThreshold: z.number().positive(),
    recoveryPerSecond: z.number().positive(),
    downSeconds: z.number().positive(),
    /** Seconds after standing in which nothing can shake the mech again. */
    footingSeconds: z.number().positive(),
    /** The lurch of losing a leg, on top of whatever took the leg off. */
    legLossImpulse: z.number().nonnegative(),
    pilotInjuryChance: Probability,
    woundAccuracyFactor: Factor,
    /** How much easier a mech on the ground is to hit. */
    proneAccuracyFactor: Factor,
    staggeredAccuracyFactor: Factor,
    staggeredSpeedFactor: Factor,
  })
  .superRefine((rules, ctx) => {
    if (rules.knockdownThreshold <= rules.staggerThreshold) {
      ctx.addIssue({
        code: 'custom',
        path: ['knockdownThreshold'],
        message: 'a mech staggers before it falls: knockdownThreshold must exceed staggerThreshold',
      });
    }
  });

export type SimulationRules = z.infer<typeof SimulationRulesSchema>;
export type MovementRules = z.infer<typeof MovementRulesSchema>;
export type CombatRules = z.infer<typeof CombatRulesSchema>;
export type HeatRules = z.infer<typeof HeatRulesSchema>;
export type DamageRules = z.infer<typeof DamageRulesSchema>;
export type StabilityRules = z.infer<typeof StabilityRulesSchema>;
export type ArcProfile = z.infer<typeof ArcProfileSchema>;
export type FrameRules = z.infer<typeof FrameRulesSchema>;
export type FrameProfile = z.infer<typeof FrameProfileSchema>;
