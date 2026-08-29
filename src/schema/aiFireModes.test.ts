import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { checkIntegrity } from './integrity';
import type { Catalog, ContentIssue } from './load';
import { AiRulesSchema } from './rulesAwareness';

describe('AI fire-mode policy', () => {
  it('authors an exact range-band policy for the Canister Cannon', () => {
    expect(catalog.rules.ai.fireModes).toEqual({
      lbx_ac10: { short: 'cluster', medium: 'slug', long: 'slug' },
    });
  });

  it('keeps each weapon policy strict', () => {
    expect(AiRulesSchema.safeParse({
      ...catalog.rules.ai,
      fireModes: {
        lbx_ac10: {
          ...catalog.rules.ai.fireModes.lbx_ac10,
          extreme: 'slug',
        },
      },
    }).success).toBe(false);
  });

  it('rejects policy references to unknown weapons and modes', () => {
    const rules = {
      ...catalog.rules,
      ai: {
        ...catalog.rules.ai,
        fireModes: {
          missing_cannon: { short: 'cluster', medium: 'slug', long: 'slug' },
          lbx_ac10: { short: 'missing_mode', medium: 'slug', long: 'slug' },
        },
      },
    } satisfies Catalog['rules'];
    const issues: ContentIssue[] = [];

    checkIntegrity({ ...catalog, rules } satisfies Catalog, issues);

    expect(issues).toEqual(expect.arrayContaining([
      {
        file: 'rules/ai.json',
        path: 'fireModes.missing_cannon',
        message: 'unknown weapon "missing_cannon"',
      },
      {
        file: 'rules/ai.json',
        path: 'fireModes.lbx_ac10.short',
        message: 'unknown mode "missing_mode" for weapon "lbx_ac10"',
      },
    ]));
  });
});
