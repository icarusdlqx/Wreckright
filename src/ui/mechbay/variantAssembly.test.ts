import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { variantAssembly } from './variantAssembly';

describe('Prime inspection comparison', () => {
  it('compares a named variant against the authored chassis rather than another saved variant', () => {
    const prime = catalog.designs.get('sentinel_brawler')!;
    const variant = { ...prime, id: 'my-captured-fit', name: 'Ash Lantern',
      mounts: [...prime.mounts.slice(1), { weaponId: 'ac5', location: 'left_arm' as const }] };
    const before = JSON.stringify(variant);
    const result = variantAssembly(catalog, variant);
    expect(result.prime?.id).toBe(prime.id);
    expect(result.changed).toBe(true);
    expect(result.additions).toBe(1);
    expect(result.removals).toBe(1);
    expect(result.foreignWeapons).toBeGreaterThan(0);
    expect(result.foreignOrigin).toBe('Linewrought');
    expect(JSON.stringify(variant)).toBe(before);
  });

  it('counts moves and duplicate assemblies honestly but ignores names, armour and cooling', () => {
    const prime = catalog.designs.get('sentinel_brawler')!;
    const renamed = { ...prime, name: 'Same weapons', heatSinks: prime.heatSinks + 1 };
    expect(variantAssembly(catalog, renamed).changed).toBe(false);
    const moved = { ...prime, mounts: prime.mounts.map((mount, index) => index === 0
      ? { ...mount, location: mount.location === 'left_arm' ? 'right_arm' as const : 'left_arm' as const } : mount) };
    const result = variantAssembly(catalog, moved);
    expect(result.additions).toBe(1);
    expect(result.removals).toBe(1);
  });
});
