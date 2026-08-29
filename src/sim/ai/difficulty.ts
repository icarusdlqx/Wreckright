import type { DifficultyTier } from '../../schema/rules';
import type { World } from '../types';

export function difficultyTier(world: World, tierId: string | null): DifficultyTier {
  const rules = world.rules.difficulty;
  const chosen = rules.tiers[tierId ?? rules.default] ?? rules.tiers[rules.default];
  if (chosen === undefined) throw new Error(`difficulty tier "${rules.default}" is missing`);
  return chosen;
}
