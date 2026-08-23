import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { LOCATIONS } from '../schema/common';
import { DesignSchema, TORSO_LOCATIONS, type Design } from '../schema/design';
import { createMech } from './entity';
import {
  activeArmourLocations,
  armourFacesForDesign,
  carryArmourDamage,
  rearArmourForPreset,
} from './designArmour';
import { computeLoadout, maximiseArmour } from './loadout';

function clone(id: string): Design {
  const design = catalog.designs.get(id);
  if (design === undefined) throw new Error(`missing design ${id}`);
  return structuredClone(design);
}

describe('design armour allocation', () => {
  it('derives frame-active locations from the authored hit tables', () => {
    const active = (frame: 'mech' | 'vehicle' | 'turret') =>
      activeArmourLocations(catalog.rules, frame);
    expect(active('mech')).toEqual(LOCATIONS);
    expect(active('vehicle')).not.toContain('left_arm');
    expect(active('vehicle')).not.toContain('right_arm');
    expect(active('vehicle')).toContain('left_leg');
    expect(active('vehicle')).toContain('right_leg');
    expect(active('turret')).not.toContain('left_arm');
    expect(active('turret')).not.toContain('right_arm');
    expect(active('turret')).not.toContain('left_leg');
    expect(active('turret')).not.toContain('right_leg');
  });

  it.each([
    ['courser_patrol', 'left_arm'],
    ['drover_carrier', 'right_arm'],
    ['redoubt_emplacement', 'left_leg'],
  ] as const)('%s cannot buy plating for its unreachable %s', (designId, inactive) => {
    const design = clone(designId);
    const legal = computeLoadout(catalog, design);
    expect(legal.valid, legal.issues.map((issue) => issue.message).join('; ')).toBe(true);
    expect(design.armour[inactive]).toBe(0);

    design.armour[inactive] = 1;
    const invalid = computeLoadout(catalog, design);
    expect(invalid.armourPoints).toBe(legal.armourPoints);
    expect(invalid.issues).toContainEqual(expect.objectContaining({
      code: 'armour',
      location: inactive,
    }));
    expect(maximiseArmour(catalog, design).armour[inactive]).toBe(0);
  });

  it('keeps legacy designs on the authored default split', () => {
    const design = clone('sentinel_brawler');
    expect(design.rearArmour).toBeUndefined();
    expect(DesignSchema.safeParse(design).success).toBe(true);

    for (const location of LOCATIONS) {
      const faces = armourFacesForDesign(catalog.rules.construction, design, location);
      const expectedRear = TORSO_LOCATIONS.includes(location as (typeof TORSO_LOCATIONS)[number])
        ? Math.round(design.armour[location] * catalog.rules.construction.rearArmour.fraction)
        : 0;
      expect(faces, location).toEqual({
        front: design.armour[location] - expectedRear,
        rear: expectedRear,
      });
    }
  });

  it('uses exact torso points and conserves every location total at spawn', () => {
    const design = clone('sentinel_brawler');
    design.rearArmour = { centre_torso: 0, left_torso: 4, right_torso: 5 };
    const mech = createMech(catalog, catalog.rules, {
      id: 91,
      team: 0,
      designId: design.id,
      design,
      pilotId: 'nadia_ostrow',
      spawn: { x: 0, y: 0 },
      facingDegrees: 0,
    });
    for (const location of LOCATIONS) {
      const state = mech.locations[location];
      expect(state.armourMax + state.rearArmourMax, location).toBe(design.armour[location]);
    }
    expect(mech.locations.centre_torso.rearArmourMax).toBe(0);
    expect(mech.locations.left_torso.rearArmourMax).toBe(4);
    expect(mech.locations.right_torso.rearArmourMax).toBe(5);
    expect(mech.locations.left_leg.rearArmourMax).toBe(0);
    expect(mech.locations.centre_torso.hasRearArmourFace).toBe(true);
    expect(mech.locations.left_leg.hasRearArmourFace).toBe(false);
  });

  it('derives deterministic exact allocations from every authored preset', () => {
    const design = clone('sentinel_brawler');
    for (const preset of catalog.rules.construction.rearArmour.presets) {
      const allocation = rearArmourForPreset(catalog.rules.construction, design, preset.id);
      expect(allocation).not.toBeNull();
      expect(rearArmourForPreset(catalog.rules.construction, design, preset.id)).toEqual(allocation);
      if (allocation === null) continue;
      const allocated = { ...design, rearArmour: allocation };
      for (const location of LOCATIONS) {
        const faces = armourFacesForDesign(catalog.rules.construction, allocated, location);
        expect(faces.front + faces.rear, `${preset.id} ${location}`).toBe(
          design.armour[location],
        );
      }
    }
    expect(rearArmourForPreset(catalog.rules.construction, design, 'not_a_preset')).toBeNull();
  });

  it('keeps explicit rear points legal when maximising changes paid totals', () => {
    const design = clone('sentinel_brawler');
    design.rearArmour = {
      centre_torso: design.armour.centre_torso,
      left_torso: design.armour.left_torso,
      right_torso: design.armour.right_torso,
    };
    design.heatSinks = 40;

    const maximised = maximiseArmour(catalog, design);
    expect(DesignSchema.safeParse(maximised).success).toBe(true);
    for (const location of TORSO_LOCATIONS) {
      expect(maximised.rearArmour?.[location]).toBeLessThanOrEqual(maximised.armour[location]);
    }
  });

  it('carries missing plate across face and total changes without a free repair', () => {
    expect(carryArmourDamage(
      { front: 65, rear: 15 },
      { front: 75, rear: 25 },
      { front: 50, rear: 50 },
    )).toEqual({ front: 40, rear: 40 });

    const grown = carryArmourDamage(
      { front: 80, rear: 20 },
      { front: 80, rear: 20 },
      { front: 90, rear: 30 },
    );
    expect(grown).toEqual({ front: 80, rear: 20 });
    expect((90 - grown.front) + (30 - grown.rear)).toBe(20);
  });
});
