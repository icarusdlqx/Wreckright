import { describe, expect, it } from 'vitest';
import { EquipmentSchema } from './equipment';

const valid = {
  id: 'test_gear',
  name: 'Test Gear',
  faction: 'linewrought' as const,
  category: 'electronics' as const,
  tonnage: 1,
  slots: 1,
  cost: 1,
  stats: { sensor_range_factor: 1.2 },
  tags: [],
};

describe('equipment stats', () => {
  it('accepts simulation-backed fields', () => {
    expect(EquipmentSchema.parse(valid).stats.sensor_range_factor).toBe(1.2);
  });

  it('rejects fields that the simulation would silently ignore', () => {
    const parsed = EquipmentSchema.safeParse({
      ...valid,
      stats: { sensor_range_factor: 1.2, imaginary_radius: 90 },
    });

    expect(parsed.success).toBe(false);
  });
});
