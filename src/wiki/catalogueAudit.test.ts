import { describe, expect, it } from 'vitest';
import { getCatalog } from '../schema/load';
import { auditCatalogue } from './catalogueAudit';
import { getWikiLibrary } from './library';

describe('catalogue consistency', () => {
  it('keeps wiki machines, stock loadouts, pilot identities and live statistics aligned', () => {
    const result = auditCatalogue(getCatalog(), getWikiLibrary());
    expect(result.issues).toEqual([]);
    expect(result.mechs).toHaveLength(16);
    expect(new Set(result.mechs.map((mech) => mech.faction))).toEqual(new Set(['aurelian', 'linewrought']));
    expect(result.mechs.every((mech) => mech.status === 'consistent')).toBe(true);
    expect(result.weapons).toHaveLength(getCatalog().weapons.size);
    expect(result.pilots).toHaveLength(getCatalog().pilots.size);
  });
});
