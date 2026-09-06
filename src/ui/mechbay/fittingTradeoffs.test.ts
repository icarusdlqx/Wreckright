import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import type { Catalog } from '../../schema/load';
import type { Weapon } from '../../schema/weapon';
import { weaponConfiguration, weaponFittingTradeoffs } from './fittingTradeoffs';

function weapon(id: string): Weapon {
  const found = catalog.weapons.get(id);
  if (found === undefined) throw new Error(`missing test weapon ${id}`);
  return found;
}

describe('faction fitting tradeoffs', () => {
  it('explains captured energy cooling and replacement costs without reducing its performance', () => {
    const before = structuredClone(weapon('medium_laser'));
    const lines = weaponFittingTradeoffs(catalog, before, 'linewrought', 'heat_sink');
    expect(lines.source).toContain('salvage only');
    expect(lines.integration).toContain('keep its full performance');
    expect(lines.integration).toContain('energy mount and enough cooling');
    expect(lines.operation).toContain('No ammunition bin needed');
    expect(lines.operation).toContain('1.67 heat/s');
    expect(lines.operation).toContain("4.8 fitted sinks' cooling");
    expect(before).toEqual(weapon('medium_laser'));
  });

  it('shows the actual ammunition tax for a workshop gun on Aurelian Stock', () => {
    const lines = weaponFittingTradeoffs(catalog, weapon('ac5'), 'aurelian', 'double_heat_sink');
    expect(lines.source).toContain('Yard, when stocked');
    expect(lines.integration).toContain('ballistic mount');
    expect(lines.integration).toContain('extra boxes and tonnage for ammunition');
    expect(lines.operation).toContain('0.5 heat/s');
    expect(lines.operation).toContain('can detonate if breached');
  });

  it('does not invent ammunition for the Linewrought flamer', () => {
    const lines = weaponFittingTradeoffs(catalog, weapon('flamer'), 'aurelian');
    expect(lines.integration).toContain('compatible energy mount');
    expect(lines.operation).toContain('No separate fuel bin is tracked');
    expect(lines.operation).not.toContain('Each ammo ton');
  });

  it('derives supply, ammunition boxes and sink effectiveness from the current catalogue', () => {
    const alternate: Catalog = {
      ...catalog,
      rules: {
        ...catalog.rules,
        construction: { ...catalog.rules.construction, ammoSlotsPerTon: 3 },
        economy: {
          ...catalog.rules.economy,
          market: { ...catalog.rules.economy.market, availableFactions: ['aurelian'] },
        },
      },
    };
    expect(weaponFittingTradeoffs(alternate, weapon('medium_laser')).source).toContain('Yard');
    const line = weaponFittingTradeoffs(alternate, weapon('ac5'));
    expect(line.source).toContain('salvage only');
    expect(line.operation).toContain('3 boxes');
    expect(weaponFittingTradeoffs(catalog, weapon('medium_laser'), 'linewrought', 'missing').operation)
      .not.toContain('fitted sinks');
  });

  it('labels mixed stock configurations by their actual armament', () => {
    for (const id of ['bulwark_assault', 'sentinel_brawler', 'halberd_prime', 'warden_lancer']) {
      const design = catalog.designs.get(id);
      if (design === undefined) throw new Error(`missing ${id}`);
      expect(weaponConfiguration(catalog, design)?.label).toBe('Mixed refit');
    }
    const votive = catalog.designs.get('votive_picket');
    if (votive === undefined) throw new Error('missing Votive');
    expect(weaponConfiguration(catalog, votive)).toMatchObject({
      label: 'Aurelian armament', nativeWeapons: 4, foreignWeapons: 0,
    });
    expect(weaponConfiguration(catalog, { ...votive, mounts: [{ weaponId: 'flamer', location: 'left_arm' }] })?.label)
      .toBe('Mixed refit');
  });
});
