import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { AtmosphereSchema } from './atmosphere';

describe('AtmosphereSchema mechanics', () => {
  it('keeps omitted mechanics neutral and calm', () => {
    const atmosphere = AtmosphereSchema.parse({ id: 'neutral_air', name: 'Neutral Air' });

    expect(atmosphere.mechanics).toEqual({
      sightFactor: 1,
      sensorFactor: 1,
      heatDissipationFactor: 1,
      wind: { x: 0, y: 0 },
    });
    expect(atmosphere.night).toBe(false);
  });

  it('defaults individual mechanics without discarding authored values', () => {
    const atmosphere = AtmosphereSchema.parse({
      id: 'light_rain',
      name: 'Light Rain',
      mechanics: { sightFactor: 0.9, wind: { x: 0.2 } },
    });

    expect(atmosphere.mechanics).toEqual({
      sightFactor: 0.9,
      sensorFactor: 1,
      heatDissipationFactor: 1,
      wind: { x: 0.2, y: 0 },
    });
  });

  it('loads all nine battlefield atmospheres with bounded factors', () => {
    expect([...catalog.atmospheres.keys()].sort()).toEqual([
      'ash_dusk',
      'cold_rime',
      'dawn',
      'dust_storm',
      'hard_noon',
      'industrial_smog',
      'moonlit_night',
      'overcast_day',
      'rain',
    ]);

    for (const atmosphere of catalog.atmospheres.values()) {
      const { heatDissipationFactor, sensorFactor, sightFactor, wind } = atmosphere.mechanics;
      expect(sightFactor, atmosphere.id).toBeGreaterThanOrEqual(0.85);
      expect(sensorFactor, atmosphere.id).toBeGreaterThanOrEqual(0.9);
      expect(heatDissipationFactor, atmosphere.id).toBeGreaterThanOrEqual(0.95);
      expect(sightFactor, atmosphere.id).toBeLessThanOrEqual(1);
      expect(sensorFactor, atmosphere.id).toBeLessThanOrEqual(1);
      expect(heatDissipationFactor, atmosphere.id).toBeLessThanOrEqual(1.08);
      expect(Math.hypot(wind.x, wind.y), atmosphere.id).toBeLessThanOrEqual(1);
    }

    expect(catalog.atmospheres.get('overcast_day')?.mechanics).toEqual({
      sightFactor: 1,
      sensorFactor: 1,
      heatDissipationFactor: 1,
      wind: { x: 0, y: 0 },
    });
    expect(catalog.atmospheres.get('moonlit_night')?.night).toBe(true);
    expect(catalog.atmospheres.get('ash_dusk')?.night).toBe(true);
  });
});
