import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import { stockDesignFor } from './buildCompareModel';

export interface VariantAssembly {
  prime: Design | null;
  changed: boolean;
  additions: number;
  removals: number;
  foreignWeapons: number;
  foreignOrigin: string;
}

/** Compare actual mounted assemblies, including moves and repeated weapons. */
export function variantAssembly(catalog: Catalog, design: Design): VariantAssembly {
  const prime = stockDesignFor(catalog, design);
  const remaining = [...(prime?.mounts ?? [])];
  let additions = 0;
  for (const mount of design.mounts) {
    const match = remaining.findIndex(before => before.weaponId === mount.weaponId && before.location === mount.location);
    if (match < 0) additions += 1;
    else remaining.splice(match, 1);
  }
  const faction = catalog.chassis.get(design.chassisId)?.faction;
  return {
    prime,
    changed: prime !== null && (additions > 0 || remaining.length > 0),
    additions,
    removals: remaining.length,
    foreignWeapons: design.mounts.filter(mount => {
      const weapon = catalog.weapons.get(mount.weaponId);
      return weapon !== undefined && weapon.faction !== faction;
    }).length,
    foreignOrigin: faction === 'linewrought' ? 'Aurelian' : 'Linewrought',
  };
}
