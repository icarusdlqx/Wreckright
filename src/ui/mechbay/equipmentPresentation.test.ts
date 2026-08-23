import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { equipmentEffectLines } from './equipmentPresentation';

describe('equipment presentation', () => {
  it('provides derived player-facing copy for every catalog item without raw stat keys', () => {
    for (const equipment of catalog.equipment.values()) {
      const effects = equipmentEffectLines(catalog, equipment);
      const copy = effects.join(' ').toLocaleLowerCase();
      expect(effects, equipment.id).not.toEqual(['No simulated effect is currently listed.']);
      expect(copy, equipment.id).not.toContain('_');
      for (const [key, value] of Object.entries(equipment.stats)) {
        expect(copy, `${equipment.id}:${key}`).not.toContain(
          `${key.replaceAll('_', ' ')} ${value}`,
        );
      }
    }
  });

  it('states the sensor and defensive effects in gameplay language', () => {
    const probe = catalog.equipment.get('active_probe');
    const ams = catalog.equipment.get('ams');
    if (probe === undefined || ams === undefined) throw new Error('missing equipment fixtures');

    expect(equipmentEffectLines(catalog, probe)).toEqual([
      'Extends sensor detection range by 45%; sensors classify contacts but do not grant line of sight.',
    ]);
    expect(equipmentEffectLines(catalog, ams)).toEqual([
      'Cuts incoming missile hit chance by 32%.',
    ]);
  });

  it('distinguishes optical reach from electronic signature', () => {
    const probe = catalog.equipment.get('active_probe');
    if (probe === undefined) throw new Error('missing equipment fixture');
    const optics = {
      ...probe,
      stats: { sight_range_factor: 1.25, signature_factor: 0.6 },
    };

    expect(equipmentEffectLines(catalog, optics)).toEqual([
      'Extends optical line of sight by 25%.',
      'Cuts electronic signature by 40%.',
    ]);
  });
});
