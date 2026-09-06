import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { TerrainMapSchema } from './map';
import { createTerrainGrid } from '../sim/terrain';

describe('presentation landmark metadata', () => {
  it('accepts every authored map without changing terrain identity or elevation', () => {
    for (const data of catalog.maps.values()) {
      expect(TerrainMapSchema.safeParse(data).success).toBe(true);
      const plain = { ...data, landmarks: undefined };
      const current = createTerrainGrid(data, catalog.rules.terrain);
      const without = createTerrainGrid(plain, catalog.rules.terrain);
      for (let row = 0; row < current.height; row++) for (let column = 0; column < current.width; column++) {
        expect(current.idAt(column, row)).toBe(without.idAt(column, row));
        expect(current.elevationAt(column, row)).toBe(without.elevationAt(column, row));
      }
    }
  });

  it('rejects fake cover on walkable ground, out-of-map footprints and duplicate identities', () => {
    const data = catalog.maps.get('ridge_pass');
    if (data === undefined) throw new Error('missing Ridge');
    const site = { id: 'test_relay', name: 'Test relay', kind: 'relay' as const, column: 17, row: 17 };
    expect(TerrainMapSchema.safeParse({ ...data, landmarks: [site] }).success).toBe(true);
    for (const landmarks of [
      [{ ...site, column: 0, row: 0 }],
      [{ ...site, column: data.width }],
      [{ ...site, kind: 'spire' }],
      [site, site],
      [site, { ...site, column: 18 }],
      Array.from({ length: 4 }, () => site),
    ]) expect(TerrainMapSchema.safeParse({ ...data, landmarks }).success).toBe(false);
  });
});
