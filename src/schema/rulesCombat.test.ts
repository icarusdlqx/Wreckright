import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { CombatRulesSchema } from './rules';

describe('combat rules', () => {
  it('names the overhead hit table for what it is and rejects the old key', () => {
    const { supportHitLocationWeights, ...rest } = catalog.rules.combat;
    expect(CombatRulesSchema.safeParse(catalog.rules.combat).success).toBe(true);
    expect(
      CombatRulesSchema.safeParse({ ...rest, hitLocationWeights: supportHitLocationWeights }).success,
    ).toBe(false);
  });

  it('ships a legged concession that takes longer than a tick', () => {
    const concession = catalog.rules.combat.leggedConcession;
    expect(concession.seconds).toBeGreaterThan(1 / catalog.rules.simulation.tickRate);
    expect(concession.allyRadius).toBeGreaterThan(0);
  });

  it('gives the AI called shots from regular upward, and green a real handicap', () => {
    const tiers = catalog.rules.difficulty.tiers;
    expect(tiers.green?.calledShots).toBe(false);
    expect(tiers.regular?.calledShots).toBe(true);
    expect(tiers.green?.skillDelta).toBeLessThan(tiers.regular?.skillDelta ?? 0);
  });

  it('carries no weapon tag that nothing reads', () => {
    for (const weapon of catalog.weapons.values()) {
      expect(weapon.tags, weapon.id).not.toContain('spread');
    }
  });
});
