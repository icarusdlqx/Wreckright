import {
  CombatRulesSchema,
  DamageRulesSchema,
  FrameRulesSchema,
  HeatRulesSchema,
  MovementRulesSchema,
  SimulationRulesSchema,
  StabilityRulesSchema,
  type CombatRules,
  type DamageRules,
  type FrameRules,
  type HeatRules,
  type MovementRules,
  type SimulationRules,
  type StabilityRules,
} from './rulesBattle';
import {
  AiRulesSchema,
  SensorRulesSchema,
  TerrainRulesSchema,
  TraitRulesSchema,
  type AiRules,
  type SensorRules,
  type TerrainRules,
  type TraitRules,
} from './rulesAwareness';
import {
  AbilityRulesSchema,
  BalanceRulesSchema,
  ConstructionRulesSchema,
  DifficultyRulesSchema,
  EconomyRulesSchema,
  PilotTraitRulesSchema,
  SalvageRulesSchema,
  SupportRulesSchema,
  type AbilityRules,
  type BalanceRules,
  type ConstructionRules,
  type DifficultyRules,
  type EconomyRules,
  type PilotTraitRules,
  type SalvageRules,
  type SupportRules,
} from './rulesCampaign';

// Keep `schema/rules` as the stable public surface while the schemas themselves
// live beside the domain that owns them.
export * from './rulesBattle';
export * from './rulesAwareness';
export * from './rulesCampaign';

export interface Rules {
  readonly simulation: SimulationRules;
  readonly movement: MovementRules;
  readonly combat: CombatRules;
  readonly heat: HeatRules;
  readonly damage: DamageRules;
  readonly stability: StabilityRules;
  readonly terrain: TerrainRules;
  readonly sensors: SensorRules;
  readonly construction: ConstructionRules;
  readonly salvage: SalvageRules;
  readonly economy: EconomyRules;
  readonly support: SupportRules;
  readonly ai: AiRules;
  readonly balance: BalanceRules;
  readonly traits: TraitRules;
  readonly pilotTraits: PilotTraitRules;
  readonly abilities: AbilityRules;
  readonly frames: FrameRules;
  readonly difficulty: DifficultyRules;
}

export const RULE_SCHEMAS = {
  simulation: SimulationRulesSchema,
  movement: MovementRulesSchema,
  combat: CombatRulesSchema,
  heat: HeatRulesSchema,
  damage: DamageRulesSchema,
  stability: StabilityRulesSchema,
  terrain: TerrainRulesSchema,
  sensors: SensorRulesSchema,
  construction: ConstructionRulesSchema,
  salvage: SalvageRulesSchema,
  economy: EconomyRulesSchema,
  support: SupportRulesSchema,
  ai: AiRulesSchema,
  balance: BalanceRulesSchema,
  traits: TraitRulesSchema,
  pilotTraits: PilotTraitRulesSchema,
  abilities: AbilityRulesSchema,
  frames: FrameRulesSchema,
  difficulty: DifficultyRulesSchema,
} as const;

export type RuleId = keyof typeof RULE_SCHEMAS;
export const RULE_IDS = Object.keys(RULE_SCHEMAS) as RuleId[];
