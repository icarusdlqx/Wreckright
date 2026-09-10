import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { createMech } from './entity';
import { computeHeatProfile } from './loadoutHeat';

const sourcePilot = catalog.pilots.get('kessa_vale');
if (sourcePilot === undefined) throw new Error('missing parity-test pilot');
const neutralPilot = { ...sourcePilot, traits: [] };

describe('mechbay cooling versus the deployed machine', () => {
  it('includes every hull cooling trait for all standard designs', () => {
    for (const design of catalog.designs.values()) {
      const entity = createMech(catalog, catalog.rules, {
        id: 1, team: 0, designId: design.id, pilotId: neutralPilot.id,
        pilot: neutralPilot, spawn: { x: 100, y: 100 }, facingDegrees: 0,
      });
      const profile = computeHeatProfile(catalog, design);
      expect(profile.dissipationPerSecond, design.id).toBeCloseTo(entity.dissipationPerSecond, 10);
      expect(profile.heatCapacity, design.id).toBe(entity.heatCapacity);
      expect(profile.netHeatPerSecond, design.id).toBeCloseTo(profile.heatPerSecond - entity.dissipationPerSecond, 10);
    }
  });

  it('leaves a pilot cooling speciality contextual rather than folding it into every build', () => {
    const design = catalog.designs.get('halberd_prime');
    const coolingTrait = Object.entries(catalog.rules.pilotTraits.entries)
      .find(([, trait]) => trait.dissipationFactor > 1);
    if (design === undefined || coolingTrait === undefined) throw new Error('missing cooling test content');
    const [traitId, trait] = coolingTrait;
    const specialist = createMech(catalog, catalog.rules, {
      id: 1, team: 0, designId: design.id, pilotId: neutralPilot.id,
      pilot: { ...neutralPilot, traits: [traitId] },
      spawn: { x: 100, y: 100 }, facingDegrees: 0,
    });
    const bay = computeHeatProfile(catalog, design);
    expect(specialist.dissipationPerSecond).toBeCloseTo(bay.dissipationPerSecond * trait.dissipationFactor, 10);
    expect(specialist.dissipationPerSecond).toBeGreaterThan(bay.dissipationPerSecond);
  });
});
