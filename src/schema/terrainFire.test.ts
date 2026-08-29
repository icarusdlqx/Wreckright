import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { checkIntegrity } from './integrity';
import type { Catalog, ContentIssue } from './load';
import { TerrainRulesSchema } from './rulesAwareness';

describe('terrain fire rules', () => {
  it('authors forest fuel and a permanent, less-concealing destination', () => {
    const rules = catalog.rules.terrain;

    expect(rules.fire.burnsTo).toEqual({ forest: 'burnt_forest' });
    expect(rules.types.burnt_forest?.moveMultiplier).toBe(rules.types.forest?.moveMultiplier);
    expect(rules.types.burnt_forest?.losObstruction).toBeLessThan(
      rules.types.forest?.losObstruction ?? 0,
    );
    expect(rules.types.burnt_forest?.signatureFactor).toBeGreaterThan(
      rules.types.forest?.signatureFactor ?? 1,
    );
    expect(rules.types.burnt_forest?.visionFactor).toBeGreaterThan(
      rules.types.forest?.visionFactor ?? 1,
    );
    expect(rules.fire.burnsTo.burnt_forest).toBeUndefined();
  });

  it('keeps fire tunables strict and bounded', () => {
    const authored = catalog.rules.terrain;
    expect(TerrainRulesSchema.safeParse(authored).success).toBe(true);
    expect(TerrainRulesSchema.safeParse({
      ...authored,
      fire: { ...authored.fire, baseSpreadChance: 1.01 },
    }).success).toBe(false);
    expect(TerrainRulesSchema.safeParse({
      ...authored,
      fire: { ...authored.fire, typo: 1 },
    }).success).toBe(false);
  });

  it('rejects missing, circular and still-burnable terrain destinations', () => {
    const issuesFor = (burnsTo: Record<string, string>): ContentIssue[] => {
      const issues: ContentIssue[] = [];
      const rules = {
        ...catalog.rules,
        terrain: {
          ...catalog.rules.terrain,
          fire: { ...catalog.rules.terrain.fire, burnsTo },
        },
      } satisfies Catalog['rules'];
      checkIntegrity({ ...catalog, rules } satisfies Catalog, issues);
      return issues.filter((issue) => issue.file === 'rules/terrain.json');
    };

    expect(issuesFor({ missing_fuel: 'burnt_forest' })).toContainEqual({
      file: 'rules/terrain.json',
      path: 'fire.burnsTo.missing_fuel',
      message: 'unknown terrain type "missing_fuel"',
    });
    expect(issuesFor({ forest: 'missing_ash' })).toContainEqual({
      file: 'rules/terrain.json',
      path: 'fire.burnsTo.forest',
      message: 'unknown terrain type "missing_ash"',
    });
    expect(issuesFor({ forest: 'forest' })).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: 'burn must change terrain type' }),
      expect.objectContaining({ message: 'burn destination "forest" must not be burnable' }),
    ]));
    expect(issuesFor({ forest: 'rough', rough: 'burnt_forest' })).toContainEqual({
      file: 'rules/terrain.json',
      path: 'fire.burnsTo.forest',
      message: 'burn destination "rough" must not be burnable',
    });
  });
});
