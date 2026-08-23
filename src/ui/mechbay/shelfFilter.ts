import type { Catalog } from '../../schema/load';
import type { Weapon } from '../../schema/weapon';
import {
  factionPresentation,
  weaponCategory,
  weaponCategoryLabel,
  type WeaponCategory,
} from './weaponPresentation';

export type WeaponCategoryFilter = WeaponCategory | 'all';

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

export function shelfSearchMatches(query: string, ...fields: readonly string[]): boolean {
  const needle = normalise(query);
  if (needle.length === 0) return true;
  return fields.some((field) => normalise(field).includes(needle));
}

export function weaponMatchesShelfFilters(
  catalog: Catalog,
  weapon: Weapon,
  query: string,
  category: WeaponCategoryFilter,
): boolean {
  const actualCategory = weaponCategory(catalog, weapon);
  return (
    (category === 'all' || category === actualCategory) &&
    shelfSearchMatches(
      query,
      weapon.id,
      weapon.name,
      weapon.summary,
      weapon.faction,
      factionPresentation(weapon.faction).label,
      weapon.type,
      weaponCategoryLabel(actualCategory),
      ...weapon.tags,
    )
  );
}
