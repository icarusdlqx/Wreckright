import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { shelfSearchMatches, weaponMatchesShelfFilters } from './shelfFilter';

describe('mechbay shelf filters', () => {
  const weapon = (id: string) => {
    const entry = catalog.weapons.get(id);
    if (entry === undefined) throw new Error(`missing weapon ${id}`);
    return entry;
  };

  it('matches case-insensitive trimmed names, families, and faction labels', () => {
    expect(weaponMatchesShelfFilters(catalog, weapon('large_laser'), '  LARGE  ', 'all')).toBe(true);
    expect(weaponMatchesShelfFilters(catalog, weapon('lrm10'), 'long-range missiles', 'all')).toBe(true);
    expect(weaponMatchesShelfFilters(catalog, weapon('gauss_rifle'), 'linewrought', 'all')).toBe(true);
    expect(weaponMatchesShelfFilters(catalog, weapon('large_laser'), 'aurelian stock', 'all')).toBe(true);
    expect(weaponMatchesShelfFilters(catalog, weapon('gauss_rifle'), 'pulse', 'all')).toBe(false);
  });

  it('composes family filtering with search and treats a blank query as all', () => {
    expect(weaponMatchesShelfFilters(catalog, weapon('lrm10'), '', 'long-range-missiles')).toBe(true);
    expect(weaponMatchesShelfFilters(catalog, weapon('srm6'), '', 'long-range-missiles')).toBe(false);
    expect(weaponMatchesShelfFilters(catalog, weapon('lrm10'), 'longshot', 'lasers')).toBe(false);
    expect(shelfSearchMatches('   ', 'anything')).toBe(true);
  });
});
