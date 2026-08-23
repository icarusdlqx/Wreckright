import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { IdSchema, LOCATIONS, NameSchema } from '../../schema/common';
import { activeArmourLocations } from '../../sim/designArmour';
import {
  createLinewroughtDraft,
  linewroughtRecipes,
  listLinewroughtFrames,
} from './linewroughtBuilderModel';

describe('Linewrought builder model', () => {
  it('offers authored Linewrought mech frames but no sealed, vehicle, or turret hulls', () => {
    const frames = listLinewroughtFrames(catalog);
    const ids = frames.map((frame) => frame.chassis.id);

    expect(ids).toEqual([
      'hornet_hnt2',
      'cairn_crn3',
      'bulwark_bwk3',
      'rampart_rmp4',
      'colossus_cls1',
    ]);
    expect(ids).not.toContain('sentinel_snl2');
    expect(ids).not.toContain('courser_crs1');
    expect(ids).not.toContain('redoubt_rdt1');
    expect(frames.every((frame) => (
      frame.chassis.faction === 'linewrought' && frame.chassis.frame === 'mech'
    ))).toBe(true);
  });

  it('derives speed, slots, reachable armour, hardpoints, and traits from catalog data', () => {
    const frame = listLinewroughtFrames(catalog)
      .find((entry) => entry.chassis.id === 'hornet_hnt2');
    if (frame === undefined) throw new Error('missing Gadfly frame');

    const speedFactor = frame.chassis.traits.reduce((factor, id) => (
      factor * (catalog.rules.traits.entries[id]?.speedFactor ?? 1)
    ), 1);
    const expectedSpeed = (
      (frame.chassis.engineRating / frame.chassis.tonnage)
      * catalog.rules.movement.walkSpeedFactor
      * speedFactor
    );
    const active = activeArmourLocations(catalog.rules, frame.chassis.frame);

    expect(frame.walkSpeed).toBeCloseTo(expectedSpeed);
    expect(frame.totalSlots).toBe(LOCATIONS.reduce(
      (total, location) => total + frame.chassis.hardpoints[location].slots,
      0,
    ));
    expect(frame.activeArmourCapacity).toBe(active.reduce(
      (total, location) => total + frame.chassis.armourMax[location],
      0,
    ));
    expect(frame.hardpoints).toEqual([
      { type: 'energy', count: 4, maximumSize: 2 },
      { type: 'ballistic', count: 2, maximumSize: 2 },
      { type: 'missile', count: 3, maximumSize: 2 },
    ]);
    expect(frame.traits.map((trait) => trait.label)).toEqual([
      'Long Stride',
      'Narrow Profile',
      'Recon Optics',
    ]);
    expect(frame.strongSuit).toMatch(/m\/s|slots|points/);
    expect(frame.tradeoff).toMatch(/m\/s|slots|points/);
  });

  it('lists only authored recipes belonging to the selected frame', () => {
    expect(linewroughtRecipes(catalog, 'hornet_hnt2').map((recipe) => recipe.id))
      .toEqual(['hornet_spotter']);
    expect(linewroughtRecipes(catalog, 'sentinel_snl2')).toEqual([]);
    expect(linewroughtRecipes(catalog, 'courser_crs1')).toEqual([]);
  });

  it('creates a legal, empty gantry draft without changing catalog content', () => {
    const before = structuredClone(catalog.designs.get('hornet_spotter'));
    const draft = createLinewroughtDraft(catalog, {
      chassisId: 'hornet_hnt2',
      mode: 'bare',
      name: '  Patchwork   Runner  ',
    });

    expect(draft.name).toBe('Patchwork Runner');
    expect(draft.id).toBe('patchwork_runner');
    expect(IdSchema.safeParse(draft.id).success).toBe(true);
    expect(NameSchema.safeParse(draft.name).success).toBe(true);
    expect(draft.chassisId).toBe('hornet_hnt2');
    expect(draft.mounts).toEqual([]);
    expect(draft.ammo).toEqual([]);
    expect(draft.equipment).toEqual([]);
    expect(catalog.designs.get('hornet_spotter')).toEqual(before);
  });

  it('clones a workshop recipe, replaces its metadata, and avoids authored id collisions', () => {
    const original = catalog.designs.get('bulwark_assault');
    if (original === undefined) throw new Error('missing Bulwark recipe');
    const before = structuredClone(original);
    const draft = createLinewroughtDraft(catalog, {
      chassisId: 'bulwark_bwk3',
      mode: 'recipe',
      recipeId: original.id,
      name: 'bulwark assault',
    });

    expect(draft.id).toBe('bulwark_assault_shopbuilt');
    expect(draft.name).toBe('bulwark assault');
    expect(draft.mounts).toEqual(original.mounts);
    expect(draft.mounts).not.toBe(original.mounts);
    expect(catalog.designs.get(original.id)).toEqual(before);
  });

  it('falls back to valid bounded metadata and rejects frames outside the concept', () => {
    const fallback = createLinewroughtDraft(catalog, {
      chassisId: 'cairn_crn3',
      mode: 'bare',
      name: '   ',
    });
    expect(IdSchema.safeParse(fallback.id).success).toBe(true);
    expect(NameSchema.safeParse(fallback.name).success).toBe(true);
    expect(fallback.name.length).toBeLessThanOrEqual(64);

    expect(() => createLinewroughtDraft(catalog, {
      chassisId: 'sentinel_snl2',
      mode: 'bare',
      name: 'Not welded',
    })).toThrow(/not a Linewrought mech frame/);
    expect(() => createLinewroughtDraft(catalog, {
      chassisId: 'courser_crs1',
      mode: 'bare',
      name: 'Not a mech',
    })).toThrow(/not a Linewrought mech frame/);
    expect(() => createLinewroughtDraft(catalog, {
      chassisId: 'hornet_hnt2',
      mode: 'recipe',
      recipeId: 'cairn_battery',
      name: 'Wrong recipe',
    })).toThrow(/unknown workshop recipe/);
  });
});
