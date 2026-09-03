import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { LOCATIONS, type MechLocation } from '../../schema/common';
import {
  locationCapacityLine,
  locationHasOccupant,
  locationWeaponMounts,
  partitionLocations,
} from './locationLayout';

function fixture() {
  const design = catalog.designs.get('sentinel_brawler');
  const chassis = catalog.chassis.get('sentinel_snl2');
  if (design === undefined || chassis === undefined) throw new Error('missing Sentinel fixture');
  return { design: structuredClone(design), chassis };
}

describe('location capacity sentence', () => {
  it('reads the mount counts and the size word from chassis and construction data', () => {
    const { chassis } = fixture();
    expect(locationCapacityLine(catalog, chassis.hardpoints.right_torso)).toBe(
      'Takes 2 energy · 1 ballistic, up to medium',
    );
    expect(locationCapacityLine(catalog, chassis.hardpoints.left_torso)).toBe(
      'Takes 2 missile, up to heavy',
    );
    expect(locationCapacityLine(catalog, chassis.hardpoints.left_leg)).toBe('Gear and ammo only');
  });

  it('never invents a mount for a location the chassis gave none', () => {
    for (const chassis of catalog.chassis.values()) {
      for (const location of LOCATIONS) {
        const line = locationCapacityLine(catalog, chassis.hardpoints[location]);
        expect(line.startsWith('Takes ')).toBe(
          locationWeaponMounts(chassis.hardpoints[location]) > 0,
        );
      }
    }
  });
});

describe('folding mount-less locations', () => {
  it('gives full cards to locations with a gun mount or something fitted', () => {
    const { chassis, design } = fixture();
    const layout = partitionLocations(chassis, design, {
      selected: null, targeting: false, compatible: new Set(), showAll: false,
    });
    expect(layout.full).toEqual([
      'centre_torso', 'left_torso', 'right_torso', 'left_arm', 'right_arm',
    ]);
    expect(layout.compact).toEqual(['head', 'left_leg', 'right_leg']);
  });

  it('unfolds a leg once a jump jet is fitted there', () => {
    const { chassis, design } = fixture();
    design.equipment.push({ equipmentId: 'jump_jet', location: 'left_leg' });
    expect(locationHasOccupant(design, 'left_leg')).toBe(true);
    const layout = partitionLocations(chassis, design, {
      selected: null, targeting: false, compatible: new Set(), showAll: false,
    });
    expect(layout.full).toContain('left_leg');
    expect(layout.compact).toEqual(['head', 'right_leg']);
  });

  it('unfolds every legal target while a part is held, but not the refusals', () => {
    const { chassis, design } = fixture();
    const compatible = new Set<MechLocation>(['left_leg', 'right_leg']);
    const held = partitionLocations(chassis, design, {
      selected: null, targeting: true, compatible, showAll: false,
    });
    expect(held.compact).toEqual(['head']);

    const idle = partitionLocations(chassis, design, {
      selected: null, targeting: false, compatible, showAll: false,
    });
    expect(idle.compact).toEqual(['head', 'left_leg', 'right_leg']);
  });

  it('unfolds a selected location and everything on request', () => {
    const { chassis, design } = fixture();
    const selected = partitionLocations(chassis, design, {
      selected: 'head', targeting: false, compatible: new Set(), showAll: false,
    });
    expect(selected.compact).toEqual(['left_leg', 'right_leg']);

    const all = partitionLocations(chassis, design, {
      selected: null, targeting: false, compatible: new Set(), showAll: true,
    });
    expect(all.full).toEqual([...LOCATIONS]);
    expect(all.compact).toEqual([]);
  });
});
